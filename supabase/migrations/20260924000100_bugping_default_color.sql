-- New projects get the Bugping coral; projects still on the old untouched default follow it.
-- Case-insensitive match: a hand-set '#6366F1' (or any other casing) is still the old default.
alter table public.projects alter column primary_color set default '#E0321F';
update public.projects set primary_color = '#E0321F' where lower(primary_color) = '#6366f1';

-- Stored custom CSS referencing the old `.dc-*` widget classes / `--dc-*` custom properties
-- needs the same rename the widget code went through, or it silently stops applying.
update public.projects
  set custom_css = replace(replace(custom_css, '--dc-', '--bp-'), '.dc-', '.bp-')
  where custom_css like '%dc-%';
