-- Enums used across the schema
create type public.feedback_type as enum ('bug', 'idea', 'general');
create type public.feedback_status as enum ('new', 'resolved', 'archived');
create type public.widget_position as enum ('bottom-right', 'bottom-left');
create type public.integration_kind as enum ('discord', 'telegram_shared', 'telegram_custom');
create type public.plan_kind as enum ('pro_monthly', 'pro_lifetime');

-- Random base62 string for public keys and link codes (modulo bias is negligible here)
create function public.random_base62(len int)
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(
    substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', (get_byte(b, i) % 62) + 1, 1),
    '' order by i
  )
  from extensions.gen_random_bytes(len) as b, generate_series(0, len - 1) as i
$$;

-- 1:1 with auth.users
create table public.profiles (
  id                  uuid primary key references auth.users on delete cascade,
  email               text not null,
  referred_by_project uuid, -- FK added in core_tables once projects exists
  created_at          timestamptz not null default now()
);
alter table public.profiles enable row level security;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
