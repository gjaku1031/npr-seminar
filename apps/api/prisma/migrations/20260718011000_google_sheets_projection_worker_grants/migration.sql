-- The v2 Sheets worker derives the current projection from authoritative domain rows.
-- Keep this forward-only and read-only so a code rollback can continue using the same role safely.
do $$
begin
  if exists (select 1 from pg_roles where rolname='npr_worker') then
    grant select on students, booking_events, seminar_sessions to npr_worker;
  end if;
end;
$$;
