-- The browser holds the anon key, so every paywall rule must be enforced here.

-- 1. Table privileges. Supabase grants ALL to anon/authenticated by default; start from zero,
--    and make tables/functions created by later migrations private by default too.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
-- Schema-scoped default privileges only ever ADD to the global default, which grants EXECUTE
-- on new functions to PUBLIC; only a global (no "in schema") revoke removes that.
alter default privileges revoke execute on functions from public;

-- Make service_role's table access explicit rather than relying on the platform's default
-- privileges (which the PGlite emulation above deliberately does not grant, to prove it).
grant select, insert, update, delete on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

grant select on public.profiles to authenticated;

grant select, delete on public.projects to authenticated;
grant update (name, allowed_origins, primary_color, trigger_text, position, hide_badge, custom_css)
  on public.projects to authenticated;

grant select, delete on public.feedback to authenticated;
grant update (status) on public.feedback to authenticated;

-- subscriptions, integrations, telegram_link_codes, usage_counters, rate_limits: service_role only.

-- 2. Row policies.
create policy "profiles: select own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "projects: select own" on public.projects
  for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "projects: update own" on public.projects
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "projects: delete own" on public.projects
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Over-quota rows stay invisible to Free accounts (including via Realtime).
create policy "feedback: select own visible" on public.feedback
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
    and (not over_quota or (select public.current_user_is_pro()))
  );

create policy "feedback: update own visible" on public.feedback
  for update to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
    and (not over_quota or (select public.current_user_is_pro()))
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
  );

create policy "feedback: delete own" on public.feedback
  for delete to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = feedback.project_id and p.owner_id = (select auth.uid())
    )
    and (not over_quota or (select public.current_user_is_pro()))
  );

-- 3. Screenshots bucket. Private: the dashboard uses signed URLs created with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- 4. Realtime for the install page and live feed.
alter publication supabase_realtime add table public.feedback;
