-- The last origin the project's allow-list refused (config or submit), shown to the owner with an "Allow" action.
alter table public.projects
  add column blocked_origin text check (char_length(blocked_origin) <= 2048),
  add column blocked_origin_at timestamptz;

-- The owner clears it when allowing the origin (RLS "projects: update own" still applies).
grant update (blocked_origin, blocked_origin_at) on public.projects to authenticated;
