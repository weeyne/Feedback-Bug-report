create table public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles on delete cascade,
  plan               public.plan_kind not null,
  status             text not null,          -- raw Lemon Squeezy status
  ls_customer_id     text,
  ls_subscription_id text unique,            -- monthly only
  ls_order_id        text unique,            -- lifetime only
  current_period_end timestamptz,            -- monthly only
  updated_at         timestamptz not null default now()
);
create index subscriptions_user_id_idx on public.subscriptions (user_id);
alter table public.subscriptions enable row level security;

create table public.projects (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles on delete cascade,
  public_key      text not null unique default ('pk_' || public.random_base62(16)),
  name            text not null check (char_length(name) between 1 and 80),
  allowed_origins text[] not null default '{}', -- empty = any origin
  primary_color   text not null default '#6366f1' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  trigger_text    text not null default 'Feedback' check (char_length(trigger_text) between 1 and 40),
  position        public.widget_position not null default 'bottom-right',
  hide_badge      boolean not null default false, -- applied only when the owner is Pro
  custom_css      text check (octet_length(custom_css) <= 10240), -- applied only when the owner is Pro
  created_at      timestamptz not null default now()
);
create index projects_owner_id_idx on public.projects (owner_id);
alter table public.projects enable row level security;

alter table public.profiles
  add constraint profiles_referred_by_project_fkey
  foreign key (referred_by_project) references public.projects on delete set null;

create table public.integrations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects on delete cascade,
  kind              public.integration_kind not null,
  enabled           boolean not null default true,
  target            text,             -- telegram chat_id
  secret_encrypted  text,             -- discord webhook URL or custom bot token (AES-256-GCM)
  last_error        text,
  last_delivered_at timestamptz,
  created_at        timestamptz not null default now(),
  unique (project_id, kind)
);
alter table public.integrations enable row level security;

create table public.telegram_link_codes (
  code       text primary key default public.random_base62(12),
  project_id uuid not null references public.projects on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
alter table public.telegram_link_codes enable row level security;

create table public.feedback (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects on delete cascade,
  type            public.feedback_type not null,
  message         text not null check (char_length(message) between 1 and 5000),
  email           text check (char_length(email) <= 254),
  screenshot_path text,               -- screenshots/{project_id}/{feedback_id}.{ext}
  metadata        jsonb not null default '{}',
  status          public.feedback_status not null default 'new',
  over_quota      boolean not null default false,
  created_at      timestamptz not null default now()
);
create index feedback_project_created_idx on public.feedback (project_id, created_at desc);
alter table public.feedback enable row level security;

create table public.usage_counters (
  owner_id          uuid not null references public.profiles on delete cascade,
  period            date not null,    -- first day of month, UTC
  count             int not null default 0,
  quota_notice_sent boolean not null default false,
  primary key (owner_id, period)
);
alter table public.usage_counters enable row level security;

create table public.rate_limits (
  key          text not null,         -- e.g. 'submit:{project_key}:{ip_hash}'
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
