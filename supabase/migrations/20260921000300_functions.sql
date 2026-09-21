-- Single source of truth for Pro status.
create function public.is_pro(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.user_id = p_uid
      and (
        (s.plan = 'pro_lifetime' and s.status = 'paid')
        or (s.plan = 'pro_monthly' and s.status in ('active', 'on_trial', 'past_due'))
        or (s.plan = 'pro_monthly' and s.status = 'cancelled' and s.current_period_end > now())
      )
  );
$$;

-- Used by RLS policies; cannot be pointed at another user.
create function public.current_user_is_pro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_pro(auth.uid());
$$;

-- Atomically counts one submission for the owner in the current UTC month.
create function public.consume_quota(p_owner uuid)
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.usage_counters as u (owner_id, period, count)
  values (p_owner, date_trunc('month', now() at time zone 'utc')::date, 1)
  on conflict (owner_id, period) do update set count = u.count + 1
  returning u.count;
$$;

-- True only for the first caller per owner per month: gates the one-time "limit reached" alert.
create function public.claim_quota_notice(p_owner uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.usage_counters
  set quota_notice_sent = true
  where owner_id = p_owner
    and period = date_trunc('month', now() at time zone 'utc')::date
    and not quota_notice_sent;
  return found;
end;
$$;

-- Fixed-window counter. Returns true when the limit is exceeded.
create function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup keeps the table small without a cron job.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return v_count > p_max;
end;
$$;

-- Supabase grants execute on new functions to anon/authenticated by default; lock them down.
revoke execute on function
  public.is_pro(uuid),
  public.current_user_is_pro(),
  public.consume_quota(uuid),
  public.claim_quota_notice(uuid),
  public.hit_rate_limit(text, int, int),
  public.handle_new_user(),
  public.random_base62(int)
from public, anon, authenticated;

grant execute on function
  public.is_pro(uuid),
  public.consume_quota(uuid),
  public.claim_quota_notice(uuid),
  public.hit_rate_limit(text, int, int),
  public.random_base62(int)
to service_role;

grant execute on function public.current_user_is_pro() to authenticated, service_role;
