#!/usr/bin/env bash
# 개발 환경 전용 예약 초기화. 가족 예약과 그에 딸린 체크인·QR·이력·시트 발송·예약 문자·멱등 기록을 지움
# 학생·설명회·회차·스캐너 기기·관리자 계정·시트 매핑 설정은 유지. 실행 전에 PostgreSQL 백업을 만듦
# 실행: pve-release 에서 root 로 실행
#   reset-development-bookings.sh preflight                       지울 대상 건수만 출력
#   reset-development-bookings.sh execute '<확인 문구>' [--leave-services-stopped]
#   --leave-services-stopped 는 web 까지 멈추고, 검증된 초기화 뒤에도 세 서비스를 멈춘 채 지연 배포에 넘김
# 종료 코드: 0 성공, 1 사전 조건·확인 문구·백업·검증 실패 또는 서비스 복구 실패
set -Eeuo pipefail

# 허용 호스트·DB·배포 잠금·확인 문구·관리 대상 서비스
readonly expected_host=pve-release
readonly database_name=npr_seminar
readonly deploy_lock=/run/lock/npr-seminar-deploy.lock
readonly confirmation='RESET ALL NPR DEVELOPMENT BOOKINGS'
readonly web_service=npr-seminar-web.service
readonly -a writer_services=(
  npr-seminar-api.service
  npr-seminar-worker.service
)

# 인자와 진행 상태 표식
mode=${1:-preflight}
provided_confirmation=${2:-}
leave_services_stopped=false
reset_completed=false
database_mutation_committed=false

# 오류를 출력하고 종료 코드 1로 끝냄
die() {
  printf '[npr-development-reset] ERROR: %s\n' "$*" >&2
  exit 1
}

# 사용법 출력
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

# 명령이 없으면 중단
require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

# 실행 위치·필요 명령·백업 유닛 확인
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

# 초기화 대상 건수를 JSON 한 줄로 뽑는 SQL
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
  'activeFamilyBookings', (
    select count(*) from family_bookings where status in ('RESERVED','CHECKED_IN')
  ),
  'checkedInFamilyBookings', (
    select count(*) from family_bookings where status='CHECKED_IN'
  ),
  'activeAttendees', (
    select coalesce(sum(seat_count),0) from family_bookings where status in ('RESERVED','CHECKED_IN')
  ),
  'checkedInAttendees', (
    select coalesce(sum(seat_count),0) from family_bookings where status='CHECKED_IN'
  )
)::text;
SQL
}

# 초기화 대상 건수 출력
preflight() {
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    "${database_name}" < <(inventory_sql)
}

# 초기화 뒤 대상 테이블·예약 문자·멱등 기록이 모두 비었는지 확인. ok 또는 failed
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
then 'ok' else 'failed' end;
SQL
}

# 서비스별 초기 상태와 이번 실행이 관리하는 서비스 목록
declare -A service_initial_state=()
declare -a managed_services=()

# 종료 시 서비스 상태 정리
# - DB 변경이 커밋됐는데 검증 전이면 서비스를 멈춘 채 실패로 끝냄
# - 지연 배포 넘김 모드에서 검증까지 끝났으면 멈춘 채 둠
# - 그 밖에는 원래 실행 중이던 서비스만 다시 시작
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

# 쓰기 서비스(API·워커, 넘김 모드면 web 포함) 정지. 일시 상태면 중단
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

# 초기화 전 백업 유닛 실행
backup_database() {
  printf '[npr-development-reset] creating a recoverable pre-reset PostgreSQL backup\n'
  systemctl start npr-postgres-backup.service
  [[ $(systemctl show npr-postgres-backup.service -p Result --value) == success ]] \
    || die 'pre-reset PostgreSQL backup failed'
}

# 쓰기 서비스 정지 → 백업 → 한 트랜잭션으로 초기화 → 결과 검증
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

# 환경 확인 → 배포 잠금 → 모드·확인 문구 확인 → 실행
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
