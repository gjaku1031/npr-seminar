-- Public booking policy and secret recovery hardening.
-- Existing rows remain readable: legacy QR credentials have no recoverable
-- ciphertext and legacy OTP proofs have no selected campus.

begin;

alter table seminar_sessions
  add column guest_booking_enabled boolean not null default false;

alter table otp_challenges
  add column selected_branch_code varchar(32);

alter table otp_proof_audits
  add column selected_branch_code varchar(32);

alter table qr_credentials
  add column token_ciphertext bytea;

do $$
begin
  if exists (
    select 1
      from qr_credentials q
      join family_bookings fb on fb.id=q.family_booking_id
     where q.status='ACTIVE'
       and fb.status in ('RESERVED','CHECKED_IN')
       and q.token_ciphertext is null
  ) then
    raise exception 'ACTIVE_QR_CIPHERTEXT_REQUIRED: reset or rotate active booking QR credentials before deployment';
  end if;
end;
$$;

alter table otp_challenges
  add constraint otp_challenges_selected_branch_check
  check (selected_branch_code is null or selected_branch_code in ('SONGPA','WIRYE','GWANGJIN'));

alter table otp_proof_audits
  add constraint otp_proof_audits_selected_branch_check
  check (selected_branch_code is null or selected_branch_code in ('SONGPA','WIRYE','GWANGJIN'));

alter table qr_credentials
  add constraint qr_credentials_ciphertext_check
  check (token_ciphertext is null or octet_length(token_ciphertext) >= 30);

create table booking_access_credentials (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  family_booking_id bigint not null references family_bookings(id),
  token_digest bytea not null unique,
  status varchar(24) not null default 'ACTIVE',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_access_credentials_digest_check check (octet_length(token_digest)=32),
  constraint booking_access_credentials_status_check check (status in ('ACTIVE','REVOKED','EXPIRED')),
  constraint booking_access_credentials_state_check check (
    (status='ACTIVE' and revoked_at is null)
    or (status='REVOKED' and revoked_at is not null)
    or status='EXPIRED'
  )
);

create unique index booking_access_credentials_active_family_unique
  on booking_access_credentials(family_booking_id) where status='ACTIVE';
create index booking_access_credentials_family_status_idx
  on booking_access_credentials(family_booking_id,status);
create index booking_access_credentials_status_expires_idx
  on booking_access_credentials(status,expires_at);

create table booking_management_sessions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  booking_access_credential_id bigint not null references booking_access_credentials(id),
  family_booking_id bigint not null references family_bookings(id),
  session_digest bytea not null unique,
  status varchar(24) not null default 'ACTIVE',
  expires_at timestamptz not null,
  verified_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint booking_management_sessions_digest_check check (octet_length(session_digest)=32),
  constraint booking_management_sessions_status_check check (status in ('ACTIVE','REVOKED','EXPIRED')),
  constraint booking_management_sessions_state_check check (
    (status='ACTIVE' and revoked_at is null)
    or (status='REVOKED' and revoked_at is not null)
    or status='EXPIRED'
  )
);

create index booking_management_sessions_family_status_expires_idx
  on booking_management_sessions(family_booking_id,status,expires_at);
create index booking_management_sessions_access_credential_idx
  on booking_management_sessions(booking_access_credential_id);

-- FIRST_CHECK_IN SMS is no longer emitted. Stop only work that has not entered
-- provider delivery; SENDING and terminal rows remain as immutable history.
alter table sms_outbox drop constraint sms_outbox_status_check;
alter table sms_outbox
  add constraint sms_outbox_status_check
  check (status in ('PENDING','CLAIMED','SENDING','SENT','BLOCKED_DISABLED','BLOCKED_ALLOWLIST','FAILED_PERMANENT','DELIVERY_UNKNOWN','DEAD','CANCELLED'));

update sms_outbox
   set status='CANCELLED',
       lease_token=null,
       lease_expires_at=null,
       last_error_code='FIRST_CHECK_IN_SMS_DISABLED',
       updated_at=now()
 where source='FIRST_CHECK_IN'
   and status in ('PENDING','CLAIMED');

do $$
begin
  if exists (select 1 from pg_roles where rolname='npr_app') then
    grant select,insert,update on booking_access_credentials,booking_management_sessions to npr_app;
    grant usage,select on sequence booking_access_credentials_id_seq to npr_app;
    grant usage,select on sequence booking_management_sessions_id_seq to npr_app;
  end if;
end;
$$;

commit;
