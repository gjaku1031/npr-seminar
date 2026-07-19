#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_host=pve-release
readonly database_name=npr_seminar
readonly deploy_lock=/run/lock/npr-seminar-deploy.lock
readonly confirmation='RESET ALL NPR DEVELOPMENT BOOKINGS'
readonly web_service=npr-seminar-web.service
readonly -a writer_services=(
  npr-seminar-api.service
  npr-seminar-worker.service
)

mode=${1:-preflight}
provided_confirmation=${2:-}
leave_services_stopped=false
reset_completed=false
database_mutation_committed=false

die() {
  printf '[npr-development-reset] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  reset-development-bookings.sh preflight
  reset-development-bookings.sh execute 'RESET ALL NPR DEVELOPMENT BOOKINGS'
  reset-development-bookings.sh execute 'RESET ALL NPR DEVELOPMENT BOOKINGS' --leave-services-stopped

This host-gated development-only command removes every family reservation and
its booking/check-in/QR/Sheets-delivery projection data. It preserves students,
seminars, sessions, scanner devices, administrator accounts, and Sheet mapping
configuration. A PostgreSQL backup is required before execute.

--leave-services-stopped also stops the web service and hands all three
application services to the following deferred deployment. They are restored
on reset failure, but deliberately remain stopped after a verified reset.
USAGE
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

require_environment() {
  [[ ${EUID} -eq 0 ]] || die 'run as root'
  [[ $(hostname -s) == "${expected_host}" ]] || die "refusing to run outside ${expected_host}"
  local command_name
  for command_name in flock hostname psql runuser systemctl; do
    require_command "${command_name}"
  done
  systemctl cat npr-postgres-backup.service >/dev/null \
    || die 'npr-postgres-backup.service is not installed'
}

inventory_sql() {
  cat <<'SQL'
select json_build_object(
  'familyBookings', (select count(*) from family_bookings),
  'familyBookingStudents', (select count(*) from family_booking_students),
  'activeQrCredentials', (
    select count(*) from qr_credentials q
    join family_bookings fb on fb.id=q.family_booking_id
    where q.status='ACTIVE' and fb.status in ('RESERVED','CHECKED_IN')
  ),
  'checkInEvents', (select count(*) from check_in_events),
  'sheetOutbox', (select count(*) from sheet_outbox),
  'bookingSmsOutbox', (
    select count(*) from sms_outbox
    where source in ('BOOKING_CONFIRMED','BOOKING_CANCELLED','FIRST_CHECK_IN','SURVEY')
  ),
  'reservedCapacity', (select coalesce(sum(reserved_count),0) from session_capacities),
  'checkedInCapacity', (select coalesce(sum(checked_in_count),0) from session_capacities)
)::text;
SQL
}

preflight() {
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    "${database_name}" < <(inventory_sql)
}

post_verify() {
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    "${database_name}" <<'SQL'
select case when
  not exists (select 1 from family_bookings)
  and not exists (select 1 from family_booking_students)
  and not exists (select 1 from qr_credentials)
  and not exists (select 1 from check_in_events)
  and not exists (select 1 from booking_events)
  and not exists (select 1 from survey_responses)
  and not exists (select 1 from sheet_outbox)
  and not exists (select 1 from sheet_attempts)
  and not exists (
    select 1 from sms_outbox
     where source in ('BOOKING_CONFIRMED','BOOKING_CANCELLED','FIRST_CHECK_IN','SURVEY')
  )
  and not exists (
    select 1 from idempotency_records
     where scope in (
       'FAMILY_BOOKING_CREATE','FAMILY_BOOKING_UPDATE','FAMILY_BOOKING_CANCEL',
       'SCANNER_CHECK_IN','BOOKING_ACCESS_EXCHANGE','QR_REVOKE','QR_ROTATE',
       'SURVEY_RESPONSE_SUBMIT'
     )
  )
  and (select coalesce(sum(reserved_count),0) from session_capacities)=0
  and (select coalesce(sum(checked_in_count),0) from session_capacities)=0
then 'ok' else 'failed' end;
SQL
}

declare -A service_initial_state=()
declare -a managed_services=()

restore_services() {
  local result=$?
  trap - EXIT
  local service state
  if [[ ${database_mutation_committed} == true && ${reset_completed} != true ]]; then
    for service in "${managed_services[@]}"; do
      if systemctl is-active --quiet "${service}"; then
        systemctl stop "${service}" || result=1
      fi
    done
    printf '[npr-development-reset] reset transaction committed but verification failed; application services remain stopped\n' >&2
    exit 1
  fi
  if [[ ${leave_services_stopped} == true && ${reset_completed} == true ]]; then
    for service in "${managed_services[@]}"; do
      if systemctl is-active --quiet "${service}"; then
        systemctl stop "${service}" || result=1
      fi
    done
    printf '[npr-development-reset] verified reset complete; application services remain stopped for deferred deployment\n'
    exit "${result}"
  fi
  for service in "${managed_services[@]}"; do
    state=${service_initial_state[${service}]:-unknown}
    case ${state} in
      active)
        if ! systemctl start "${service}" || ! systemctl is-active --quiet "${service}"; then
          printf '[npr-development-reset] failed to restore %s\n' "${service}" >&2
          result=1
        fi
        ;;
      inactive|failed) ;;
      *)
        printf '[npr-development-reset] refusing to guess prior state for %s (%s)\n' "${service}" "${state}" >&2
        result=1
        ;;
    esac
  done
  exit "${result}"
}

stop_writers() {
  local service state
  managed_services=("${writer_services[@]}")
  if [[ ${leave_services_stopped} == true ]]; then
    managed_services+=("${web_service}")
  fi
  for service in "${managed_services[@]}"; do
    state=$(systemctl is-active "${service}" 2>/dev/null || true)
    case ${state} in
      active|inactive|failed) service_initial_state[${service}]=${state} ;;
      *) die "${service} is in transient state ${state:-unknown}" ;;
    esac
  done
  trap restore_services EXIT
  for service in "${managed_services[@]}"; do
    if [[ ${service_initial_state[${service}]} == active ]]; then
      systemctl stop "${service}"
      if systemctl is-active --quiet "${service}"; then
        die "failed to stop ${service}"
      fi
    fi
  done
  return 0
}

backup_database() {
  printf '[npr-development-reset] creating a recoverable pre-reset PostgreSQL backup\n'
  systemctl start npr-postgres-backup.service
  [[ $(systemctl show npr-postgres-backup.service -p Result --value) == success ]] \
    || die 'pre-reset PostgreSQL backup failed'
}

execute_reset() {
  stop_writers
  backup_database
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 "${database_name}" <<'SQL'
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

-- Fail closed if a later migration added a booking-domain FK that this reset
-- has not been updated to include.
do $block$
declare
  unexpected text;
begin
  with reset_table(name) as (values
    ('booking_management_sessions'),
    ('booking_access_credentials'),
    ('check_in_events'),
    ('survey_responses'),
    ('booking_events'),
    ('qr_credentials'),
    ('family_booking_students'),
    ('family_bookings')
  )
  select string_agg(format('%I.%I', child_ns.nspname, child.relname), ', ' order by child.relname)
    into unexpected
    from pg_constraint constraint_row
    join pg_class parent on parent.oid=constraint_row.confrelid
    join pg_namespace parent_ns on parent_ns.oid=parent.relnamespace
    join pg_class child on child.oid=constraint_row.conrelid
    join pg_namespace child_ns on child_ns.oid=child.relnamespace
   where constraint_row.contype='f'
     and parent_ns.nspname='public'
     and parent.relname in (select name from reset_table)
     and not (child_ns.nspname='public' and child.relname in (select name from reset_table));
  if unexpected is not null then
    raise exception 'DEVELOPMENT_RESET_UNEXPECTED_BOOKING_FK: %', unexpected;
  end if;
end
$block$;

-- Sheets delivery rows contain only reservation projections. Mapping and
-- schema/circuit configuration are deliberately preserved.
truncate table sheet_attempts, sheet_outbox restart identity;

-- Keep OTP/admin delivery history. Remove only reservation-related messages
-- and their append-only attempt ledger while writers are stopped.
create temporary table npr_reset_sms_outbox_ids(id bigint primary key) on commit drop;
insert into npr_reset_sms_outbox_ids(id)
select id from sms_outbox
 where source in ('BOOKING_CONFIRMED','BOOKING_CANCELLED','FIRST_CHECK_IN','SURVEY');
alter table sms_attempts disable trigger user;
delete from sms_attempts where sms_outbox_id in (select id from npr_reset_sms_outbox_ids);
alter table sms_attempts enable trigger user;
delete from sms_outbox where id in (select id from npr_reset_sms_outbox_ids);

delete from idempotency_records
 where scope in (
   'FAMILY_BOOKING_CREATE',
   'FAMILY_BOOKING_UPDATE',
   'FAMILY_BOOKING_CANCEL',
   'SCANNER_CHECK_IN',
   'BOOKING_ACCESS_EXCHANGE',
   'QR_REVOKE',
   'QR_ROTATE',
   'SURVEY_RESPONSE_SUBMIT'
 );

-- Access tables are introduced by the booking-access migration. Build the
-- exact TRUNCATE list dynamically so this command can remove legacy QR rows
-- before that migration's fail-closed ciphertext preflight runs.
do $truncate$
declare
  table_list text;
begin
  select string_agg(format('%I', name), ', ' order by ordinal)
    into table_list
    from unnest(array[
      'booking_management_sessions',
      'booking_access_credentials',
      'check_in_events',
      'survey_responses',
      'booking_events',
      'qr_credentials',
      'family_booking_students',
      'family_bookings'
    ]) with ordinality as candidate(name, ordinal)
   where to_regclass(format('public.%I', name)) is not null;
  if table_list is null then
    raise exception 'DEVELOPMENT_RESET_BOOKING_TABLES_MISSING';
  end if;
  execute 'truncate table ' || table_list || ' restart identity';
end
$truncate$;

update session_capacities
   set reserved_count=0,
       checked_in_count=0,
       version=version+1,
       updated_at=now();

-- New installations default to OFF in the migration. Re-running a
-- development reset after migration also closes every existing guest flow.
do $guest$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema='public'
       and table_name='seminar_sessions'
       and column_name='guest_booking_enabled'
  ) then
    update seminar_sessions
       set guest_booking_enabled=false,
           updated_at=now()
     where guest_booking_enabled=true;
  end if;
end
$guest$;

commit;
SQL
  database_mutation_committed=true

  local after verified
  after=$(preflight)
  verified=$(post_verify)
  [[ ${verified} == ok ]] \
    || die "post-reset verification failed: ${after}"
  reset_completed=true
  printf '[npr-development-reset] completed: %s\n' "${after}"
}

main() {
  require_environment
  exec 9>"${deploy_lock}"
  flock -n 9 || die 'another NPR deployment or reset is running'
  case ${mode} in
    preflight)
      [[ $# -eq 1 ]] || { usage >&2; die 'preflight takes no confirmation'; }
      preflight
      ;;
    execute)
      [[ $# -eq 2 || ($# -eq 3 && ${3:-} == --leave-services-stopped) ]] \
        || { usage >&2; die 'execute requires the exact confirmation phrase and optional --leave-services-stopped'; }
      [[ ${provided_confirmation} == "${confirmation}" ]] \
        || die "confirmation must be exactly: ${confirmation}"
      [[ $# -ne 3 ]] || leave_services_stopped=true
      execute_reset
      ;;
    -h|--help)
      usage
      ;;
    *)
      usage >&2
      die "unknown mode: ${mode}"
      ;;
  esac
}

main "$@"
