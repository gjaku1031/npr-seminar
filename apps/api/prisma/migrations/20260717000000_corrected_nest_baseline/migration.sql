create extension if not exists pgcrypto;

create table branches (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  code varchar(32) not null unique,
  display_name varchar(80) not null,
  source_code varchar(32) not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branches_code_check check (code in ('CAMPUS_A','CAMPUS_B','CAMPUS_C'))
);

create table admin_users (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  username varchar(120) not null unique,
  password_hash text not null,
  display_name varchar(120) not null,
  role varchar(24) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_users_role_check check (role in ('ADMIN','SCANNER'))
);

create table auth_audits (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  admin_user_id bigint references admin_users(id),
  actor_subject varchar(160),
  event_type varchar(40) not null,
  result_code varchar(80) not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index auth_audits_admin_user_id_occurred_at_idx on auth_audits(admin_user_id, occurred_at desc);

create table sync_runs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  run_type varchar(32) not null,
  status varchar(40) not null,
  initiated_by varchar(160),
  snapshot_id varchar(80),
  snapshot_hash bytea,
  staging_hash bytea,
  publishable boolean not null default false,
  login_attempted boolean not null default false,
  ambiguity_count integer not null default 0,
  raw_row_count integer not null default 0,
  included_assignment_count integer not null default 0,
  unique_student_count integer not null default 0,
  excluded_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  published_at timestamptz,
  published_by varchar(160),
  error_code varchar(100),
  constraint sync_runs_type_check check (run_type in ('SCHEDULED','MANUAL','INITIAL_DRY_RUN','OFFLINE_INITIAL_DRY_RUN')),
  constraint sync_runs_status_check check (status in ('RUNNING','READY_TO_PUBLISH','PUBLISHING','SUCCEEDED','PARTIAL','FAILED','NO_CHANGES','PUBLISHED')),
  constraint sync_runs_hash_check check (
    (snapshot_hash is null or octet_length(snapshot_hash)=32) and
    (staging_hash is null or octet_length(staging_hash)=32)
  ),
  constraint sync_runs_counts_check check (
    ambiguity_count >= 0 and raw_row_count >= 0 and included_assignment_count >= 0 and
    unique_student_count >= 0 and excluded_count >= 0
  )
);
create index sync_runs_started_at_idx on sync_runs(started_at desc, id desc);
create index sync_runs_status_started_at_idx on sync_runs(status, started_at desc);

create table sync_branch_runs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  sync_run_id bigint not null references sync_runs(id) on delete cascade,
  branch_id bigint not null references branches(id),
  sequence_no smallint not null,
  status varchar(32) not null,
  fetched_count integer not null default 0,
  staged_count integer not null default 0,
  included_count integer not null default 0,
  excluded_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  inactivated_count integer not null default 0,
  snapshot_hash bytea,
  error_code varchar(100),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint sync_branch_runs_run_branch_unique unique(sync_run_id, branch_id),
  constraint sync_branch_runs_run_sequence_unique unique(sync_run_id, sequence_no),
  constraint sync_branch_runs_sequence_check check (sequence_no between 1 and 3),
  constraint sync_branch_runs_status_check check (status in ('FETCHING','STAGED','VALIDATED','PROMOTING','PROMOTED','NO_CHANGES','FAILED','CONFLICT','READY_TO_PUBLISH','CANCELLED')),
  constraint sync_branch_runs_counts_check check (
    fetched_count >= 0 and staged_count >= 0 and included_count >= 0 and excluded_count >= 0 and
    inserted_count >= 0 and updated_count >= 0 and inactivated_count >= 0
  ),
  constraint sync_branch_runs_hash_check check (snapshot_hash is null or octet_length(snapshot_hash)=32)
);
create index sync_branch_runs_branch_started_idx on sync_branch_runs(branch_id, started_at desc);

create table staging_students (
  id bigint generated always as identity primary key,
  sync_run_id bigint not null references sync_runs(id) on delete cascade,
  branch_id bigint not null references branches(id),
  source_ordinal integer not null,
  source_unique_no varchar(160) not null,
  class_registration_no varchar(160) not null,
  source_student_no varchar(160),
  name varchar(300),
  class_name varchar(300),
  school_name varchar(300),
  grade varchar(100),
  teacher_name varchar(300),
  unit_name varchar(160),
  mother_phone_ciphertext bytea,
  mother_phone_digest bytea,
  mother_phone_last4 char(4),
  father_phone_ciphertext bytea,
  father_phone_digest bytea,
  father_phone_last4 char(4),
  source_status varchar(100),
  row_hash bytea,
  included boolean not null,
  exclusion_reason varchar(100),
  primary_candidate boolean not null default false,
  primary_selected boolean not null default false,
  class_resolution_status varchar(40),
  class_resolution_reason varchar(80),
  staged_at timestamptz not null default now(),
  constraint staging_students_run_ordinal_unique unique(sync_run_id, branch_id, source_ordinal),
  constraint staging_students_source_assignment_unique unique(sync_run_id, branch_id, source_unique_no, class_registration_no),
  constraint staging_students_phone_check check (
    (mother_phone_ciphertext is null and mother_phone_digest is null and mother_phone_last4 is null) or
    (octet_length(mother_phone_ciphertext) >= 28 and octet_length(mother_phone_digest)=32 and mother_phone_last4 ~ '^[0-9]{4}$')
  ),
  constraint staging_students_father_phone_check check (
    (father_phone_ciphertext is null and father_phone_digest is null and father_phone_last4 is null) or
    (octet_length(father_phone_ciphertext) >= 28 and octet_length(father_phone_digest)=32 and father_phone_last4 ~ '^[0-9]{4}$')
  ),
  constraint staging_students_hash_check check (row_hash is null or octet_length(row_hash)=32),
  constraint staging_students_inclusion_check check (
    (included and exclusion_reason is null) or (not included and exclusion_reason is not null)
  )
);
create index staging_students_run_student_idx on staging_students(sync_run_id, source_student_no) where included;
create index staging_students_run_branch_included_idx on staging_students(sync_run_id, branch_id, included);
create index staging_students_branch_fk_idx on staging_students(branch_id);

create or replace function reject_ready_staging_mutation() returns trigger language plpgsql as $$
declare
  run_status text;
begin
  select status into run_status from public.sync_runs
   where id=case when tg_op='DELETE' then old.sync_run_id else new.sync_run_id end;
  if tg_op='DELETE' and current_user<>session_user and run_status in ('PUBLISHED','FAILED') then
    return old;
  end if;
  if run_status<>'RUNNING' then
    raise exception 'staging is immutable after validation' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger staging_students_ready_immutable before insert or update or delete on staging_students
for each row execute function reject_ready_staging_mutation();

create or replace function purge_sync_staging(p_sync_run_id bigint) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  target public.sync_runs%rowtype;
  purged bigint;
begin
  select * into target from public.sync_runs where id=p_sync_run_id for update;
  if not found then
    raise exception 'sync run not found' using errcode='P0002';
  end if;
  if target.status='READY_TO_PUBLISH'
     and target.run_type='OFFLINE_INITIAL_DRY_RUN'
     and target.finished_at < now()-interval '24 hours' then
    update public.sync_runs set status='FAILED',publishable=false,error_code='STAGING_RETENTION_EXPIRED'
     where id=p_sync_run_id;
  elsif target.status='FAILED'
     and target.run_type='OFFLINE_INITIAL_DRY_RUN'
     and coalesce(target.finished_at,target.started_at) < now()-interval '24 hours' then
    null;
  elsif target.status<>'PUBLISHED' then
    raise exception 'sync staging is not purgeable' using errcode='55000';
  end if;
  delete from public.staging_students where sync_run_id=p_sync_run_id;
  get diagnostics purged=row_count;
  return purged;
end;
$$;
revoke all on function purge_sync_staging(bigint) from public;

create or replace function analyze_student_import() returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  execute 'analyze public.students, public.student_class_assignments';
end;
$$;
revoke all on function analyze_student_import() from public;

create table sync_conflicts (
  id bigint generated always as identity primary key,
  sync_run_id bigint not null references sync_runs(id) on delete cascade,
  conflict_type varchar(80) not null,
  branch_code varchar(32),
  source_student_no varchar(160),
  safe_details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sync_conflicts_run_type_idx on sync_conflicts(sync_run_id, conflict_type);

create table tong_auth_circuit (
  singleton_id smallint primary key,
  status varchar(16) not null,
  opened_at timestamptz,
  opened_reason_code varchar(100),
  opened_run_id bigint references sync_runs(id),
  last_reset_at timestamptz,
  last_reset_by varchar(160),
  version bigint not null default 0,
  constraint tong_auth_circuit_singleton_check check (singleton_id=1),
  constraint tong_auth_circuit_status_check check (status in ('CLOSED','OPEN')),
  constraint tong_auth_circuit_state_check check (
    (status='CLOSED' and opened_at is null and opened_reason_code is null and opened_run_id is null) or
    (status='OPEN' and opened_at is not null and opened_reason_code is not null)
  )
);

create table tong_auth_circuit_audits (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  sync_run_id bigint references sync_runs(id),
  event_type varchar(24) not null,
  actor_subject varchar(160) not null,
  reason_code varchar(100) not null,
  occurred_at timestamptz not null default now(),
  constraint tong_auth_circuit_audits_type_check check (event_type in ('OPENED','RESET'))
);
create index tong_auth_circuit_audits_run_idx on tong_auth_circuit_audits(sync_run_id);
create index tong_auth_circuit_opened_run_fk_idx on tong_auth_circuit(opened_run_id);
create index tong_auth_circuit_audits_occurred_idx on tong_auth_circuit_audits(occurred_at desc, id desc);

create table sync_leases (
  lock_name varchar(100) primary key,
  holder_run_public_id uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table students (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  source_student_no varchar(160) not null unique,
  branch_id bigint not null references branches(id),
  name varchar(300) not null,
  class_name varchar(300) not null,
  school_name varchar(300),
  grade varchar(100),
  teacher_name varchar(300),
  unit_name varchar(160),
  mother_phone_ciphertext bytea,
  mother_phone_digest bytea,
  mother_phone_last4 char(4),
  father_phone_ciphertext bytea,
  father_phone_digest bytea,
  father_phone_last4 char(4),
  source_status varchar(100),
  source_active boolean not null default true,
  source_hash bytea not null,
  class_resolution_status varchar(40) not null default 'ONE_REGULAR',
  class_resolution_reason varchar(80),
  first_seen_run_id bigint not null references sync_runs(id),
  last_seen_run_id bigint not null references sync_runs(id),
  source_inactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_phone_check check (
    (mother_phone_ciphertext is null and mother_phone_digest is null and mother_phone_last4 is null) or
    (octet_length(mother_phone_ciphertext)>=28 and octet_length(mother_phone_digest)=32 and mother_phone_last4 ~ '^[0-9]{4}$')
  ),
  constraint students_father_phone_check check (
    (father_phone_ciphertext is null and father_phone_digest is null and father_phone_last4 is null) or
    (octet_length(father_phone_ciphertext)>=28 and octet_length(father_phone_digest)=32 and father_phone_last4 ~ '^[0-9]{4}$')
  ),
  constraint students_hash_check check (octet_length(source_hash)=32),
  constraint students_active_check check (
    (source_active and source_inactivated_at is null) or (not source_active and source_inactivated_at is not null)
  ),
  constraint students_resolution_check check (
    class_resolution_status in ('ONE_REGULAR','SCIENCE_ONLY','AMBIGUOUS_FALLBACK') and
    ((class_resolution_status in ('ONE_REGULAR','SCIENCE_ONLY') and class_resolution_reason is null) or
     (class_resolution_status='AMBIGUOUS_FALLBACK' and class_resolution_reason in ('MULTIPLE_REGULAR','NO_CLASS')))
  )
);
create index students_branch_active_id_idx on students(branch_id, source_active, id);
create index students_mother_digest_idx on students(mother_phone_digest) where source_active;
create index students_mother_last4_branch_idx on students(mother_phone_last4, branch_id) where source_active;
create index students_father_digest_idx on students(father_phone_digest) where source_active;
create index students_father_last4_branch_idx on students(father_phone_last4, branch_id) where source_active;
create index students_last_seen_run_idx on students(last_seen_run_id);
create index students_first_seen_run_fk_idx on students(first_seen_run_id);

create table student_class_assignments (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  student_id bigint not null references students(id),
  source_unique_no varchar(160) not null,
  class_registration_no varchar(160) not null,
  class_name varchar(300) not null,
  teacher_name varchar(300),
  unit_name varchar(160),
  school_name varchar(300),
  grade varchar(100),
  source_hash bytea not null,
  source_active boolean not null default true,
  first_seen_run_id bigint not null references sync_runs(id),
  last_seen_run_id bigint not null references sync_runs(id),
  source_inactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_assignments_source_unique unique(student_id, source_unique_no, class_registration_no),
  constraint student_assignments_hash_check check (octet_length(source_hash)=32),
  constraint student_assignments_class_check check (class_name <> '' and class_name !~ '[\[\]]'),
  constraint student_assignments_active_check check (
    (source_active and source_inactivated_at is null) or (not source_active and source_inactivated_at is not null)
  )
);
create index student_assignments_student_active_idx on student_class_assignments(student_id, source_active, class_name);
create index student_assignments_last_seen_idx on student_class_assignments(last_seen_run_id);
create index student_assignments_first_seen_run_fk_idx on student_class_assignments(first_seen_run_id);

create table student_history (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id),
  sync_run_id bigint not null references sync_runs(id),
  change_type varchar(32) not null,
  previous_snapshot jsonb,
  current_snapshot jsonb,
  father_phone_ciphertext bytea,
  father_phone_digest bytea,
  father_phone_last4 char(4),
  recorded_at timestamptz not null default now(),
  constraint student_history_type_check check (change_type in ('CREATED','UPDATED','REACTIVATED','INACTIVATED')),
  constraint student_history_father_phone_check check (
    (father_phone_ciphertext is null and father_phone_digest is null and father_phone_last4 is null) or
    (octet_length(father_phone_ciphertext)>=28 and octet_length(father_phone_digest)=32 and father_phone_last4 ~ '^[0-9]{4}$')
  )
);
create index student_history_student_recorded_idx on student_history(student_id, recorded_at desc, id desc);
create index student_history_run_idx on student_history(sync_run_id);

create table seminars (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  title varchar(300) not null,
  description text,
  status varchar(24) not null default 'DRAFT',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seminars_status_check check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  constraint seminars_version_check check (version > 0)
);

create table seminar_sessions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  seminar_id bigint not null references seminars(id),
  scope varchar(16) not null default 'ALL',
  branch_id bigint references branches(id),
  title varchar(300) not null,
  place varchar(300) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booking_opens_at timestamptz,
  booking_closes_at timestamptz,
  status varchar(24) not null default 'DRAFT',
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seminar_sessions_status_check check (status in ('DRAFT','OPEN','CLOSED','CANCELLED','ARCHIVED')),
  constraint seminar_sessions_scope_check check (
    (scope='ALL' and branch_id is null) or (scope='BRANCH' and branch_id is not null)
  ),
  constraint seminar_sessions_time_check check (starts_at < ends_at),
  constraint seminar_sessions_version_check check (version > 0),
  constraint seminar_sessions_window_check check (booking_opens_at is null or booking_closes_at is null or booking_opens_at < booking_closes_at)
);
create index seminar_sessions_seminar_starts_idx on seminar_sessions(seminar_id, starts_at);
create index seminar_sessions_branch_starts_idx on seminar_sessions(branch_id, starts_at);
create index seminar_sessions_status_starts_idx on seminar_sessions(status, starts_at);

create table session_capacities (
  session_id bigint primary key references seminar_sessions(id),
  capacity integer not null,
  reserved_count integer not null default 0,
  checked_in_count integer not null default 0,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint session_capacities_counts_check check (
    capacity >= 0 and reserved_count >= 0 and checked_in_count >= 0 and
    reserved_count <= capacity and checked_in_count <= reserved_count
  )
);

create table otp_proof_audits (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  proof_digest bytea unique,
  purpose varchar(40) not null,
  contact_digest bytea not null,
  contact_ciphertext bytea not null,
  contact_last4 char(4) not null,
  status varchar(24) not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint otp_proof_audits_digest_check check (octet_length(contact_digest)=32 and (proof_digest is null or octet_length(proof_digest)=32)),
  constraint otp_proof_audits_contact_check check (octet_length(contact_ciphertext)>=30 and contact_last4 ~ '^[0-9]{4}$'),
  constraint otp_proof_audits_status_check check (status in ('VERIFIED','CONSUMED','EXPIRED','REVOKED'))
);
create index otp_proof_audits_lookup_idx on otp_proof_audits(contact_digest, purpose, status);

create table otp_challenges (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  purpose varchar(40) not null,
  contact_digest bytea not null,
  contact_ciphertext bytea not null,
  contact_last4 char(4) not null,
  code_digest bytea not null,
  status varchar(24) not null default 'PENDING',
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  expires_at timestamptz not null,
  verified_at timestamptz,
  otp_proof_audit_id bigint unique references otp_proof_audits(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint otp_challenges_digest_check check (octet_length(contact_digest)=32 and octet_length(code_digest)=32),
  constraint otp_challenges_contact_check check (octet_length(contact_ciphertext)>=30 and contact_last4 ~ '^[0-9]{4}$'),
  constraint otp_challenges_purpose_check check (purpose in ('FAMILY_BOOKING','BOOKING_MANAGE')),
  constraint otp_challenges_status_check check (status in ('PENDING','VERIFIED','EXPIRED','LOCKED')),
  constraint otp_challenges_attempts_check check (max_attempts between 1 and 10 and attempt_count between 0 and max_attempts),
  constraint otp_challenges_state_check check (
    (status='VERIFIED' and verified_at is not null and otp_proof_audit_id is not null) or
    (status<>'VERIFIED' and verified_at is null and otp_proof_audit_id is null)
  )
);
create index otp_challenges_contact_created_idx on otp_challenges(contact_digest, created_at desc);
create index otp_challenges_status_expires_idx on otp_challenges(status, expires_at);

create table family_bookings (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  session_id bigint not null references seminar_sessions(id),
  contact_digest bytea not null,
  contact_ciphertext bytea not null,
  contact_last4 char(4) not null,
  attendance_party varchar(16) not null,
  seat_count integer not null,
  status varchar(24) not null default 'RESERVED',
  version bigint not null default 1,
  booking_source varchar(24) not null default 'WEB_APP',
  otp_proof_audit_id bigint not null references otp_proof_audits(id),
  checked_in_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_bookings_contact_check check (
    octet_length(contact_digest)=32 and octet_length(contact_ciphertext)>=28 and contact_last4 ~ '^[0-9]{4}$'
  ),
  constraint family_bookings_party_seats_check check (
    (attendance_party in ('MOTHER','FATHER') and seat_count=1) or (attendance_party='BOTH' and seat_count=2)
  ),
  constraint family_bookings_status_check check (status in ('RESERVED','CHECKED_IN','CANCELLED','NO_SHOW')),
  constraint family_bookings_source_check check (booking_source in ('WEB_APP','PHONE','TEACHER','ON_SITE')),
  constraint family_bookings_version_check check (version > 0),
  constraint family_bookings_state_time_check check (
    (status='CHECKED_IN' and checked_in_at is not null and cancelled_at is null) or
    (status='CANCELLED' and cancelled_at is not null) or
    (status in ('RESERVED','NO_SHOW') and checked_in_at is null and cancelled_at is null)
  ),
  constraint family_bookings_id_session_unique unique(id, session_id)
);
create unique index family_bookings_active_contact_unique
  on family_bookings(session_id, contact_digest) where status in ('RESERVED','CHECKED_IN');
create index family_bookings_session_status_idx on family_bookings(session_id, status);
create index family_bookings_last4_active_idx on family_bookings(session_id, contact_last4, status);
create index family_bookings_otp_proof_idx on family_bookings(otp_proof_audit_id);

create sequence guest_participant_no_seq;

create table family_booking_students (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  family_booking_id bigint not null,
  session_id bigint not null references seminar_sessions(id),
  participant_type varchar(16) not null default 'ENROLLED',
  student_id bigint references students(id),
  active boolean not null default true,
  released_at timestamptz,
  branch_code_at_booking varchar(32) not null,
  source_student_no_snapshot varchar(160) not null,
  student_name_snapshot varchar(300) not null,
  class_name_snapshot varchar(300) not null,
  school_name_snapshot varchar(300),
  grade_snapshot varchar(100),
  unit_name_snapshot varchar(160),
  teacher_name_snapshot varchar(300),
  created_at timestamptz not null default now(),
  constraint family_booking_students_family_student_unique unique(family_booking_id, student_id),
  constraint family_booking_students_family_session_fk foreign key(family_booking_id, session_id)
    references family_bookings(id, session_id) deferrable initially immediate,
  constraint family_booking_students_participant_check check (
    (participant_type='ENROLLED' and student_id is not null) or
    (participant_type='GUEST' and student_id is null)
  ),
  constraint family_booking_students_active_check check (
    (active and released_at is null) or (not active and released_at is not null)
  )
);
create unique index family_booking_students_active_session_student_unique
  on family_booking_students(session_id, student_id) where active and student_id is not null;
create index family_booking_students_student_idx on family_booking_students(student_id);
create index family_booking_students_session_active_idx on family_booking_students(session_id, active);

create table qr_credentials (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  family_booking_id bigint not null references family_bookings(id),
  token_digest bytea not null unique,
  version integer not null,
  status varchar(24) not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  superseded_by_id bigint unique references qr_credentials(id),
  constraint qr_credentials_booking_version_unique unique(family_booking_id, version),
  constraint qr_credentials_digest_check check (octet_length(token_digest)=32),
  constraint qr_credentials_version_check check (version > 0),
  constraint qr_credentials_status_check check (status in ('ACTIVE','REVOKED','EXPIRED')),
  constraint qr_credentials_state_check check (
    (status='ACTIVE' and revoked_at is null) or (status in ('REVOKED','EXPIRED') and revoked_at is not null)
  )
);
create unique index qr_credentials_active_family_unique on qr_credentials(family_booking_id) where status='ACTIVE';
create index qr_credentials_family_status_idx on qr_credentials(family_booking_id, status);

create table scanner_devices (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  branch_id bigint not null references branches(id),
  name varchar(120) not null,
  model varchar(120),
  location varchar(160),
  gate_code varchar(100) not null,
  battery_percent integer,
  battery_is_charging boolean,
  battery_reported_at timestamptz,
  status varchar(24) not null default 'ACTIVE',
  paired_by varchar(160) not null,
  paired_at timestamptz not null default now(),
  last_heartbeat_at timestamptz,
  revoked_at timestamptz,
  revoked_by varchar(160),
  selected_session_id bigint references seminar_sessions(id),
  scan_mode_locked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint scanner_devices_status_check check (status in ('ACTIVE','REVOKED','UNPAIRED')),
  constraint scanner_devices_battery_check check (battery_percent is null or battery_percent between 0 and 100),
  constraint scanner_devices_revoke_check check (
    (status='ACTIVE' and revoked_at is null and revoked_by is null) or
    (status in ('REVOKED','UNPAIRED') and revoked_at is not null and revoked_by is not null)
  )
);
create index scanner_devices_status_heartbeat_idx on scanner_devices(status, last_heartbeat_at desc);
create index scanner_devices_branch_status_idx on scanner_devices(branch_id, status);
create index scanner_devices_selected_session_idx on scanner_devices(selected_session_id);

create table scanner_pairing_audits (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  scanner_device_id bigint references scanner_devices(id),
  event_type varchar(32) not null,
  actor_subject varchar(160),
  result_code varchar(80) not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index scanner_pairing_audits_device_occurred_idx on scanner_pairing_audits(scanner_device_id, occurred_at desc);

create table booking_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  family_booking_id bigint not null references family_bookings(id),
  event_type varchar(32) not null,
  actor_subject varchar(160),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint booking_events_type_check check (event_type in ('CREATED','UPDATED','CANCELLED','QR_ISSUED','QR_ROTATED','QR_REVOKED','CHECKED_IN'))
);
create index booking_events_family_occurred_idx on booking_events(family_booking_id, occurred_at, id);

create table check_in_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  family_booking_id bigint references family_bookings(id),
  qr_credential_id bigint references qr_credentials(id),
  session_id bigint not null references seminar_sessions(id),
  source varchar(16) not null,
  result varchar(40) not null,
  seat_count integer not null,
  scanner_device_id bigint references scanner_devices(id),
  gate_code varchar(100),
  actor_subject varchar(160),
  idempotency_key_digest bytea,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint check_in_events_source_check check (source in ('QR','MANUAL')),
  constraint check_in_events_result_check check (result in ('CHECKED_IN','ALREADY_CHECKED_IN','CANCELLED','SESSION_MISMATCH','EXPIRED_QR','REVOKED_QR','INVALID_QR','RESERVATION_NOT_FOUND','NOT_AUTHORIZED')),
  constraint check_in_events_seats_check check (seat_count between 0 and 2),
  constraint check_in_events_idempotency_digest_check check (idempotency_key_digest is null or octet_length(idempotency_key_digest)=32)
);
create index check_in_events_family_occurred_idx on check_in_events(family_booking_id, occurred_at, id);
create index check_in_events_session_occurred_idx on check_in_events(session_id, occurred_at desc, id desc);
create index check_in_events_credential_idx on check_in_events(qr_credential_id);
create index check_in_events_scanner_idx on check_in_events(scanner_device_id);

create table idempotency_records (
  id bigint generated always as identity primary key,
  scope varchar(80) not null,
  key_digest bytea not null,
  request_digest bytea not null,
  resource_public_id uuid,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint idempotency_records_scope_key_unique unique(scope, key_digest),
  constraint idempotency_records_digest_check check (octet_length(key_digest)=32 and octet_length(request_digest)=32),
  constraint idempotency_records_status_check check (response_status between 100 and 599)
);
create index idempotency_records_expires_idx on idempotency_records(expires_at);

create table sms_templates (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  key varchar(80) not null unique,
  name varchar(160) not null,
  purpose varchar(40) not null,
  title varchar(200),
  body text not null,
  active boolean not null default true,
  version bigint not null default 1,
  created_by varchar(160) not null,
  updated_by varchar(160) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_templates_key_check check (key ~ '^[A-Z0-9_]{3,80}$'),
  constraint sms_templates_purpose_check check (purpose in ('OTP','BOOKING_CONFIRMED','BOOKING_CANCELLED','FIRST_CHECK_IN','ADMIN_GROUP','SURVEY')),
  constraint sms_templates_version_check check (version > 0),
  constraint sms_templates_body_check check (length(body) > 0)
);
create index sms_templates_purpose_active_idx on sms_templates(purpose, active);

create table sms_outbox (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  event_key_digest bytea not null unique,
  source varchar(40) not null,
  branch_code varchar(32) not null,
  seminar_session_public_id uuid,
  family_booking_public_id uuid,
  recipient_ciphertext bytea not null,
  recipient_digest bytea not null,
  recipient_last4 char(4) not null,
  message_ciphertext bytea not null,
  title_ciphertext bytea,
  message_type varchar(8) not null,
  message_bytes integer not null,
  title_bytes integer,
  status varchar(32) not null default 'PENDING',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  provider_message_id varchar(80),
  provider_result_code integer,
  provider_message_type varchar(16),
  last_error_code varchar(80),
  actor_subject varchar(160),
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sms_outbox_event_digest_check check (octet_length(event_key_digest)=32),
  constraint sms_outbox_recipient_check check (
    octet_length(recipient_ciphertext)>=30 and octet_length(recipient_digest)=32 and recipient_last4 ~ '^[0-9]{4}$'
  ),
  constraint sms_outbox_source_check check (source in ('OTP','BOOKING_CONFIRMED','BOOKING_CANCELLED','FIRST_CHECK_IN','ADMIN_GROUP','SURVEY')),
  constraint sms_outbox_branch_check check (branch_code in ('CAMPUS_A','CAMPUS_B','CAMPUS_C')),
  constraint sms_outbox_type_check check (message_type in ('SMS','LMS')),
  constraint sms_outbox_bytes_check check (
    (message_type='SMS' and message_bytes between 1 and 90) or
    (message_type='LMS' and message_bytes between 91 and 2000)
  ),
  constraint sms_outbox_title_check check (
    (title_ciphertext is null and title_bytes is null) or
    (message_type='LMS' and title_ciphertext is not null and title_bytes between 1 and 44)
  ),
  constraint sms_outbox_status_check check (status in ('PENDING','CLAIMED','SENDING','SENT','BLOCKED_DISABLED','BLOCKED_ALLOWLIST','FAILED_PERMANENT','DELIVERY_UNKNOWN','DEAD')),
  constraint sms_outbox_attempt_check check (attempt_count between 0 and 12),
  constraint sms_outbox_lease_check check (
    (status in ('CLAIMED','SENDING') and lease_token is not null and lease_expires_at is not null) or
    (status not in ('CLAIMED','SENDING') and lease_token is null and lease_expires_at is null)
  )
);
create index sms_outbox_worker_idx on sms_outbox(status, next_attempt_at, id);
create index sms_outbox_session_created_idx on sms_outbox(seminar_session_public_id, created_at desc);
create index sms_outbox_family_created_idx on sms_outbox(family_booking_public_id, created_at desc);
create index sms_outbox_recipient_created_idx on sms_outbox(recipient_digest, created_at desc);

create table sms_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  sms_outbox_id bigint not null references sms_outbox(id),
  attempt_no integer not null,
  result varchar(32) not null,
  provider_result_code integer,
  provider_message_id varchar(80),
  error_code varchar(80),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint sms_attempts_outbox_attempt_unique unique(sms_outbox_id, attempt_no),
  constraint sms_attempts_no_check check (attempt_no between 1 and 12),
  constraint sms_attempts_result_check check (result in ('SENT','BLOCKED_DISABLED','BLOCKED_ALLOWLIST','RETRYABLE','FAILED_PERMANENT','DELIVERY_UNKNOWN','DEAD'))
);
create index sms_attempts_outbox_occurred_idx on sms_attempts(sms_outbox_id, occurred_at desc);

create table sheet_mappings (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  seminar_session_public_id uuid not null unique,
  spreadsheet_id varchar(160) not null,
  reservation_sheet_title varchar(100) not null default '예약명단',
  reservation_sheet_id integer not null default 1777564107,
  log_sheet_title varchar(100) not null default '예약로그',
  log_sheet_id integer not null default 1787194666,
  campus_a_sheet_id integer not null default 0,
  campus_b_sheet_id integer not null default 470961226,
  campus_c_sheet_id integer not null default 1080132708,
  schema_fingerprint varchar(100) not null,
  schema_version integer not null default 1,
  enabled boolean not null default false,
  circuit_status varchar(24) not null default 'BLOCKED',
  block_reason_code varchar(80),
  last_validated_at timestamptz,
  dispatch_lease_owner uuid,
  dispatch_lease_expires_at timestamptz,
  last_dispatch_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sheet_mappings_schema_version_check check (schema_version > 0),
  constraint sheet_mappings_circuit_check check (circuit_status in ('CLOSED','OPEN','BLOCKED')),
  constraint sheet_mappings_enabled_check check (not enabled or (circuit_status='CLOSED' and last_validated_at is not null)),
  constraint sheet_mappings_dispatch_lease_check check (
    (dispatch_lease_owner is null and dispatch_lease_expires_at is null) or
    (dispatch_lease_owner is not null and dispatch_lease_expires_at is not null)
  )
);
create index sheet_mappings_enabled_circuit_idx on sheet_mappings(enabled,circuit_status);

create table sheet_outbox (
  id bigint generated always as identity primary key,
  delivery_public_id uuid not null default gen_random_uuid() unique,
  mapping_id bigint not null references sheet_mappings(id),
  event_id uuid not null,
  event_type varchar(32) not null,
  seminar_session_public_id uuid not null,
  family_booking_public_id uuid not null,
  family_booking_student_public_id uuid not null,
  student_public_id uuid not null,
  booking_version bigint not null,
  snapshot_ciphertext bytea not null,
  status varchar(24) not null default 'PENDING',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_owner uuid,
  lease_expires_at timestamptz,
  last_error_code varchar(80),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sheet_outbox_mapping_event_child_unique unique(mapping_id,event_id,family_booking_student_public_id),
  constraint sheet_outbox_event_type_check check (event_type in ('CREATED','UPDATED','CANCELLED','CHECKED_IN')),
  constraint sheet_outbox_version_check check (booking_version > 0),
  constraint sheet_outbox_snapshot_check check (octet_length(snapshot_ciphertext)>=30),
  constraint sheet_outbox_status_check check (status in ('PENDING','CLAIMED','RETRY','SUCCEEDED','DEAD','BLOCKED')),
  constraint sheet_outbox_attempt_check check (attempt_count between 0 and 12),
  constraint sheet_outbox_lease_check check (
    (status='CLAIMED' and lease_owner is not null and lease_expires_at is not null) or
    (status<>'CLAIMED' and lease_owner is null and lease_expires_at is null)
  )
);
create index sheet_outbox_worker_idx on sheet_outbox(status,next_attempt_at,id);
create index sheet_outbox_booking_version_idx on sheet_outbox(family_booking_public_id,booking_version);

create table sheet_attempts (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  sheet_outbox_id bigint not null references sheet_outbox(id),
  attempt_no integer not null,
  result varchar(24) not null,
  error_code varchar(80),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint sheet_attempts_outbox_attempt_unique unique(sheet_outbox_id,attempt_no),
  constraint sheet_attempts_no_check check (attempt_no between 1 and 12),
  constraint sheet_attempts_result_check check (result in ('SUCCEEDED','RETRY','DEAD','BLOCKED'))
);
create index sheet_attempts_outbox_occurred_idx on sheet_attempts(sheet_outbox_id,occurred_at desc);

create table survey_responses (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  family_booking_id bigint not null unique,
  session_id bigint not null references seminar_sessions(id),
  rating smallint not null,
  comment text,
  photo_attached boolean not null default false,
  photo_name varchar(255),
  submitted_at timestamptz not null default now(),
  constraint survey_responses_family_session_unique unique(family_booking_id,session_id),
  constraint survey_responses_family_session_fk foreign key(family_booking_id,session_id)
    references family_bookings(id,session_id),
  constraint survey_responses_rating_check check (rating between 1 and 5),
  constraint survey_responses_comment_check check (comment is null or char_length(comment)<=2000),
  constraint survey_responses_photo_check check (
    (photo_attached and photo_name is not null and photo_name<>'' and photo_name !~ '[/\\]') or
    (not photo_attached and photo_name is null)
  )
);
create index survey_responses_session_submitted_idx on survey_responses(session_id,submitted_at desc,id desc);

create or replace function reject_append_only_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'append-only relation % cannot be updated or deleted', tg_table_name using errcode='55000';
end;
$$;

create trigger auth_audits_append_only before update or delete on auth_audits
for each row execute function reject_append_only_mutation();
create trigger tong_auth_circuit_audits_append_only before update or delete on tong_auth_circuit_audits
for each row execute function reject_append_only_mutation();
create trigger student_history_append_only before update or delete on student_history
for each row execute function reject_append_only_mutation();
create trigger scanner_pairing_audits_append_only before update or delete on scanner_pairing_audits
for each row execute function reject_append_only_mutation();
create trigger booking_events_append_only before update or delete on booking_events
for each row execute function reject_append_only_mutation();
create trigger check_in_events_append_only before update or delete on check_in_events
for each row execute function reject_append_only_mutation();
create trigger sms_attempts_append_only before update or delete on sms_attempts
for each row execute function reject_append_only_mutation();
create trigger sheet_attempts_append_only before update or delete on sheet_attempts
for each row execute function reject_append_only_mutation();
create trigger survey_responses_append_only before update or delete on survey_responses
for each row execute function reject_append_only_mutation();

comment on column students.mother_phone_ciphertext is 'AES-GCM application ciphertext only; plaintext is forbidden.';
comment on column qr_credentials.token_digest is 'SHA-256 digest only; raw QR token is forbidden.';
comment on table auth_audits is 'Append-only; never store passwords, cookies, CSRF tokens, phone values, or request bodies.';
comment on table check_in_events is 'Append-only; safe metadata must not contain raw QR, phone, OTP, or cookies.';
comment on table sms_outbox is 'Encrypted recipient and message payloads; API/log output must remain masked and sanitized.';
comment on table sms_attempts is 'Append-only provider-attempt audit; never store raw recipient, message, OTP, QR, or credentials.';
comment on table sheet_outbox is 'Encrypted per-child event snapshots; raw QR bearer tokens are forbidden.';
comment on table sheet_attempts is 'Append-only Sheets delivery audit; never store student, phone, QR, or credential values.';

insert into branches(code,display_name,source_code) values
  ('CAMPUS_A','A','SE8A'),
  ('CAMPUS_B','B','KG5M'),
  ('CAMPUS_C','C','SE9P');
insert into seminars(public_id,title,status) values
  ('00000000-0000-4000-8000-000000000101','2026 대학교 입시 설명회','PUBLISHED');
insert into seminar_sessions(
  public_id,seminar_id,scope,branch_id,title,place,starts_at,ends_at,
  booking_opens_at,booking_closes_at,status
) select
  '00000000-0000-4000-8000-000000000102',id,'ALL',null,'1회차',
  'A 교통회관 2층 대강당','2026-08-21 11:00:00+09','2026-08-21 13:00:00+09',
  '2026-07-17 00:00:00+09','2026-08-21 11:00:00+09','OPEN'
from seminars where public_id='00000000-0000-4000-8000-000000000101';
insert into session_capacities(session_id,capacity)
select id,800 from seminar_sessions where public_id='00000000-0000-4000-8000-000000000102';
insert into sheet_mappings(
  seminar_session_public_id,spreadsheet_id,schema_fingerprint,enabled,circuit_status,block_reason_code
) values (
  '00000000-0000-4000-8000-000000000102',
  'EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx',
  encode(digest('예약명단:A:H|예약로그:A:H|A:B:J:K:L:M|B:A:I:J:K|C:A:I:J:K|hidden:Z:v1','sha256'),'hex'),
  false,'BLOCKED','WORKBOOK_LINK_WRITER_ACCESS'
);
insert into tong_auth_circuit(singleton_id,status) values (1,'CLOSED');
insert into sync_leases(lock_name) values ('tongtontong-student-sync');

do $$
begin
  if exists (select 1 from pg_roles where rolname='npr_app') then
    execute 'revoke delete on all tables in schema public from npr_app';
    execute 'grant usage on schema public to npr_app';
    execute 'grant select, insert, update on all tables in schema public to npr_app';
    execute 'grant usage, select on all sequences in schema public to npr_app';
    execute 'revoke update on sms_outbox, sheet_mappings, sheet_outbox from npr_app';
    execute 'revoke insert, update on sms_attempts, sheet_attempts from npr_app';
    execute 'grant execute on function public.purge_sync_staging(bigint) to npr_app';
    execute 'grant execute on function public.analyze_student_import() to npr_app';
  end if;
  if exists (select 1 from pg_roles where rolname='npr_worker') then
    execute 'revoke all on all tables in schema public from npr_worker';
    execute 'revoke all on all sequences in schema public from npr_worker';
    execute 'grant usage on schema public to npr_worker';
    execute 'grant select on family_bookings, family_booking_students to npr_worker';
    execute 'grant select, update on sms_outbox, sheet_mappings, sheet_outbox to npr_worker';
    execute 'grant select, insert on sms_attempts, sheet_attempts to npr_worker';
    execute 'grant usage, select on sequence sms_attempts_id_seq, sheet_attempts_id_seq to npr_worker';
  end if;
end;
$$;

-- The deployment role must not be the runtime role. Grant runtime SELECT/INSERT/UPDATE explicitly;
-- do not grant DELETE on append-only or core ledger tables, and never use a superuser at runtime.
-- Create LOGIN roles and passwords outside migrations. npr_worker is intentionally unable to
-- read admin/session/student source tables or mutate booking/domain ledgers.
