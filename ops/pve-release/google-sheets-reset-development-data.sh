#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_host=pve-release
readonly worker_service=npr-seminar-worker.service
readonly worker_env=/etc/npr-seminar/worker.env
readonly credential_path=/etc/npr-seminar/google-service-account.json
readonly spreadsheet_id=EXAMPLE_SHEET_ID_xxxxxxxxxxxxxxxxxxxxxxxxxxx
readonly confirmation="CLEAR NPR DEVELOPMENT SHEETS ${spreadsheet_id}"
readonly command_path=/srv/npr-seminar/current/ops/pve-release/google-sheets-reset-development-data.mjs
readonly deploy_lock=/run/lock/npr-seminar-deploy.lock
readonly sheets_v4_fingerprint=a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be

mode=${1:-preflight}
provided_confirmation=${2:-}

die() {
  printf '[npr-sheets-development-reset] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<USAGE
Usage:
  google-sheets-reset-development-data.sh preflight
  google-sheets-reset-development-data.sh execute '${confirmation}'

Run the v4 mapping prepare command first. This command preserves row 1,
formatting, validation, hidden/protected marker columns, and clears only data
rows in 예약명단, 예약집계, and 로그.
USAGE
}

env_value() {
  local key=$1
  awk -v key="${key}" 'index($0,key "=")==1 { print substr($0,length(key)+2); exit }' "${worker_env}"
}

require_environment() {
  [[ ${EUID} -eq 0 ]] || die 'run as root'
  [[ $(hostname -s) == "${expected_host}" ]] || die "refusing to run outside ${expected_host}"
  for command_name in awk flock hostname node psql runuser stat systemctl systemd-run; do
    command -v "${command_name}" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
  done
  [[ -f ${worker_env} && ! -L ${worker_env} && $(stat -c '%U:%G:%a' "${worker_env}") == root:root:600 ]] \
    || die 'worker environment must be a root-owned 0600 regular file'
  [[ -f ${credential_path} && ! -L ${credential_path} \
    && $(stat -c '%U:%G:%a' "${credential_path}") == npr-worker:npr-worker:600 ]] \
    || die 'Google credential must be npr-worker:npr-worker mode 0600'
  [[ -f ${command_path} && ! -L ${command_path} ]] || die 'deployed Sheets reset command is missing'
  [[ $(env_value GOOGLE_SHEETS_SPREADSHEET_ID) == "${spreadsheet_id}" ]] \
    || die 'worker spreadsheet configuration does not match the approved workbook'
  [[ $(env_value GOOGLE_APPLICATION_CREDENTIALS) == "${credential_path}" ]] \
    || die 'worker credential path is not the approved path'
}

require_prepared_blocked_mapping() {
  local state
  state=$(runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    --set=spreadsheet_id="${spreadsheet_id}" \
    --set=fingerprint="${sheets_v4_fingerprint}" \
    npr_seminar <<'SQL'
select case when count(*) > 0
  and bool_and(not enabled)
  and bool_and(circuit_status='BLOCKED')
  and bool_and(block_reason_code='GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED')
  and bool_and(schema_version=4)
  and bool_and(schema_fingerprint=:'fingerprint')
  and bool_and(reservation_sheet_title='예약명단')
  and bool_and(reservation_sheet_id=1777564107)
  and bool_and(last_validated_at is not null)
then 'ok' else 'failed' end
from sheet_mappings
where spreadsheet_id=:'spreadsheet_id';
SQL
  ) || die 'could not verify the prepared v4 mapping state'
  [[ ${state} == ok ]] \
    || die 'Sheets reset requires a freshly prepared, disabled v4 mapping'
}

worker_was_active=false
worker_initial_state=

restore_worker() {
  local result=$?
  trap - EXIT
  if [[ ${worker_was_active} == true ]]; then
    if ! systemctl start "${worker_service}" || ! systemctl is-active --quiet "${worker_service}"; then
      printf '[npr-sheets-development-reset] failed to restore %s\n' "${worker_service}" >&2
      result=1
    fi
  else
    printf '[npr-sheets-development-reset] %s was %s; leaving it unchanged\n' \
      "${worker_service}" "${worker_initial_state}" >&2
  fi
  exit "${result}"
}

run_isolated() {
  worker_initial_state=$(systemctl is-active "${worker_service}" 2>/dev/null || true)
  case ${worker_initial_state} in
    active) worker_was_active=true ;;
    inactive|failed) ;;
    *) die "${worker_service} is in transient state ${worker_initial_state:-unknown}" ;;
  esac
  trap restore_worker EXIT
  if [[ ${worker_was_active} == true ]]; then
    systemctl stop "${worker_service}"
    systemctl is-active --quiet "${worker_service}" && die "failed to stop ${worker_service}"
  fi
  systemd-run --quiet --wait --pipe --collect \
    --unit=npr-seminar-sheets-development-reset \
    --service-type=exec \
    --uid=npr-worker \
    --gid=npr-worker \
    --property="EnvironmentFile=${worker_env}" \
    --setenv="NPR_SHEETS_RESET_MODE=${mode}" \
    --setenv="NPR_CONFIRMED_SPREADSHEET_ID=${spreadsheet_id}" \
    --setenv="NPR_SHEETS_RESET_CONFIRMATION=${provided_confirmation}" \
    --property=NoNewPrivileges=true \
    --property=PrivateDevices=true \
    --property=PrivateTmp=true \
    --property=ProtectSystem=strict \
    --property="ReadOnlyPaths=${credential_path}" \
    /usr/bin/node "${command_path}"
}

main() {
  require_environment
  exec 9>"${deploy_lock}"
  flock -n 9 || die 'another NPR deployment or reset is running'
  case ${mode} in
    preflight)
      [[ $# -eq 1 ]] || { usage >&2; die 'preflight takes no confirmation'; }
      ;;
    execute)
      [[ $# -eq 2 ]] || { usage >&2; die 'execute requires the exact confirmation phrase'; }
      [[ ${provided_confirmation} == "${confirmation}" ]] \
        || die "confirmation must be exactly: ${confirmation}"
      ;;
    -h|--help)
      usage
      return
      ;;
    *)
      usage >&2
      die "unknown mode: ${mode}"
      ;;
  esac
  require_prepared_blocked_mapping
  run_isolated
}

main "$@"
