-- When the embedded widget last fetched its config (set at most hourly by the config endpoint).
alter table public.projects add column widget_seen_at timestamptz;
