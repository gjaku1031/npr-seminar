begin;

alter table booking_events
  add column cancellation_type varchar(24);

-- Historical free-form reasons cannot be mapped reliably. Preserve them in
-- safe_metadata, classify known public cancellations, and use OTHER for the
-- legacy administrator bucket.
alter table booking_events disable trigger booking_events_append_only;
update booking_events
   set cancellation_type=case
     when actor_subject is null then 'SELF_SERVICE'
     else 'OTHER'
   end
 where event_type='CANCELLED';
alter table booking_events enable trigger booking_events_append_only;

-- Keep the immediately previous application release rollback-compatible. That
-- release does not write cancellation_type, so infer only missing values while
-- preserving every explicit value written by the new release.
create or replace function set_booking_event_cancellation_type()
returns trigger
language plpgsql
as $$
begin
  if new.event_type='CANCELLED' and new.cancellation_type is null then
    new.cancellation_type=case
      when new.actor_subject is null then 'SELF_SERVICE'
      else 'OTHER'
    end;
  end if;

  return new;
end;
$$;

create trigger booking_events_cancellation_type_default
before insert on booking_events
for each row execute function set_booking_event_cancellation_type();

alter table booking_events
  add constraint booking_events_cancellation_type_check check (
    (
      event_type='CANCELLED'
      and cancellation_type is not null
      and cancellation_type in ('SELF_SERVICE','PHONE','TEACHER','OTHER')
    )
    or (event_type<>'CANCELLED' and cancellation_type is null)
  );

comment on column booking_events.cancellation_type is
  'Audited cancellation classification. Admin UI writes PHONE, TEACHER, or OTHER; public proof cancellation writes SELF_SERVICE.';

commit;
