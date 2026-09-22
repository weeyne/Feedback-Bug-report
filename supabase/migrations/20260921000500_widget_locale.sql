-- Widget UI language chosen by the project owner ('auto' = visitor's browser language).
create type public.widget_locale as enum ('auto', 'en', 'ru', 'uk', 'es');

alter table public.projects
  add column locale public.widget_locale not null default 'auto';

-- Settings column: owners may change it from the dashboard.
grant update (locale) on public.projects to authenticated;
