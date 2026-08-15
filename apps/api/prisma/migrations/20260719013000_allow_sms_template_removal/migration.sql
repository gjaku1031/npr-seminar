-- SMS template lifecycle permits a true DELETE only for unused, non-default
-- templates.  The application service enforces those conditions under the
-- shared template advisory lock; the runtime role needs the matching narrow
-- table privilege for that branch to execute.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'npr_app') then
    grant delete on table sms_templates to npr_app;
  end if;
end
$$;
