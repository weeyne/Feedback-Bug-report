-- Phase 5: Paddle replaces Lemon Squeezy (Lemon Squeezy cannot pay out to Ukraine).
-- No rows use the Lemon Squeezy columns yet, so they are renamed in place.
alter table public.subscriptions rename column ls_customer_id to paddle_customer_id;
alter table public.subscriptions rename column ls_subscription_id to paddle_subscription_id;
alter table public.subscriptions rename column ls_order_id to paddle_transaction_id;

-- occurred_at of the Paddle event that last wrote the row: older events are ignored.
alter table public.subscriptions add column paddle_occurred_at timestamptz;
-- True while a cancellation is scheduled for the end of the billing period.
alter table public.subscriptions
  add column cancel_at_period_end boolean not null default false;

create index subscriptions_paddle_customer_id_idx on public.subscriptions (paddle_customer_id);

-- Single source of truth for Pro status. Paddle keeps a cancelled subscription 'active' until the
-- period ends and only then sends 'canceled', so no date check is needed.
create or replace function public.is_pro(p_uid uuid)
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
        or (s.plan = 'pro_monthly' and s.status in ('active', 'trialing', 'past_due'))
      )
  );
$$;
