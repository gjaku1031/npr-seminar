alter table scanner_pairing_audits
  drop constraint scanner_pairing_audits_scanner_device_id_fkey,
  add constraint scanner_pairing_audits_scanner_device_id_fkey
    foreign key (scanner_device_id) references scanner_devices(id)
    on delete cascade on update no action;

alter table check_in_events
  drop constraint check_in_events_scanner_device_id_fkey,
  add constraint check_in_events_scanner_device_id_fkey
    foreign key (scanner_device_id) references scanner_devices(id)
    on delete set null on update no action;

-- These two ledgers stay append-only for direct statements. The narrow exceptions
-- below only admit the nested row operation issued by the scanner_devices FK.
drop trigger scanner_pairing_audits_append_only on scanner_pairing_audits;
create or replace function guard_scanner_pairing_audits_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and pg_trigger_depth() > 1
     and old.scanner_device_id is not null
     and not exists (
       select 1 from public.scanner_devices where id = old.scanner_device_id
     ) then
    return old;
  end if;

  raise exception 'append-only relation % cannot be updated or deleted', tg_table_name
    using errcode = '55000';
end;
$$;
create trigger scanner_pairing_audits_append_only
before update or delete on scanner_pairing_audits
for each row execute function guard_scanner_pairing_audits_append_only();

drop trigger check_in_events_append_only on check_in_events;
create or replace function guard_check_in_events_append_only()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and old.scanner_device_id is not null
     and new.scanner_device_id is null
     and (to_jsonb(new) - 'scanner_device_id') = (to_jsonb(old) - 'scanner_device_id')
     and not exists (
       select 1 from public.scanner_devices where id = old.scanner_device_id
     ) then
    return new;
  end if;

  raise exception 'append-only relation % cannot be updated or deleted', tg_table_name
    using errcode = '55000';
end;
$$;
create trigger check_in_events_append_only
before update or delete on check_in_events
for each row execute function guard_check_in_events_append_only();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'npr_app') then
    grant delete on scanner_devices to npr_app;
    revoke update, delete on scanner_pairing_audits, check_in_events from npr_app;
  end if;
end;
$$;
