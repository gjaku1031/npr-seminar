-- The Sheets projection suppresses the homeroom teacher for science-only
-- students, which requires the isolated worker to classify current classes.
-- Keep the new authority read-only; the worker still cannot mutate source data.
do $$
begin
  if exists (select 1 from pg_roles where rolname='npr_worker') then
    grant select on student_class_assignments to npr_worker;
  end if;
end;
$$;
