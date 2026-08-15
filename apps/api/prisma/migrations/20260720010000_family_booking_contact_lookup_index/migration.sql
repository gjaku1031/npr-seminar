-- Support exact phone-digest booking lookup in newest-first order. This is an
-- additive index so the previous release remains compatible during rollback.

begin;

create index family_bookings_contact_created_id_idx
  on family_bookings(contact_digest, created_at desc, id desc);

commit;
