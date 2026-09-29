-- Nothing subscribes to feedback changes (the dashboard polls), so stop publishing them to Realtime:
-- one less path by which report contents could leave the database. Guarded so an environment where
-- the table was already removed by hand does not fail the migration.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback'
  ) then
    alter publication supabase_realtime drop table public.feedback;
  end if;
end
$$;
