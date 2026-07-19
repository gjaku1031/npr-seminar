-- The roster distinguishes a no-show action from a generic booking update.
alter table booking_events drop constraint booking_events_type_check;
alter table booking_events add constraint booking_events_type_check check (
  event_type in (
    'CREATED', 'UPDATED', 'CANCELLED', 'QR_ISSUED', 'QR_ROTATED',
    'QR_REVOKED', 'CHECKED_IN', 'MARKED_NO_SHOW'
  )
);
