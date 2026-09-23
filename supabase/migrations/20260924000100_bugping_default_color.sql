-- New projects get the Bugping coral; projects still on the old untouched default follow it.
alter table public.projects alter column primary_color set default '#E0321F';
update public.projects set primary_color = '#E0321F' where primary_color = '#6366f1';
