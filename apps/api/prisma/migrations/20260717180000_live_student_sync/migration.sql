alter table sync_runs add column metrics jsonb not null default '{}'::jsonb;
alter table tong_auth_circuit_audits add column reason text;
alter table staging_students add column father_phone_observed boolean not null default false;

alter table sync_runs drop constraint sync_runs_status_check;
alter table sync_runs add constraint sync_runs_status_check check (
  status in ('QUEUED','RUNNING','READY_TO_PUBLISH','PUBLISHING','SUCCEEDED','PARTIAL','FAILED','NO_CHANGES','PUBLISHED','CONFLICT','CANCELLED')
);

alter table sync_branch_runs drop constraint sync_branch_runs_status_check;
alter table sync_branch_runs add constraint sync_branch_runs_status_check check (
  status in ('PENDING','FETCHING','STAGED','VALIDATED','PROMOTING','PROMOTED','NO_CHANGES','FAILED','CONFLICT','READY_TO_PUBLISH','CANCELLED')
);

create table sync_audit_events (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  sync_run_id bigint not null references sync_runs(id) on delete cascade,
  branch_code varchar(32),
  event_type varchar(40) not null,
  actor_subject varchar(160) not null,
  counts jsonb,
  error_code varchar(100),
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint sync_audit_events_branch_check check (branch_code is null or branch_code in ('CAMPUS_A','CAMPUS_B','CAMPUS_C')),
  constraint sync_audit_events_type_check check (event_type in (
    'RUN_QUEUED','LOGIN_ATTEMPTED','BRANCH_STARTED','BRANCH_STAGED','BRANCH_VALIDATED',
    'CONFLICT_DETECTED','RUN_READY_TO_PUBLISH','RUN_PUBLISHED','RUN_SUCCEEDED','RUN_FAILED','RUN_CANCELLED'
  ))
);
create index sync_audit_events_run_sequence_idx on sync_audit_events(sync_run_id,id);
create index sync_audit_events_occurred_idx on sync_audit_events(occurred_at,id);
create trigger sync_audit_events_append_only before update or delete on sync_audit_events
for each row execute function reject_append_only_mutation();
