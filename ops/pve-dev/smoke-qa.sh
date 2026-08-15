#!/usr/bin/env bash
set -Eeuo pipefail

readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly config_dir=/etc/npr-seminar-qa
readonly compose_file=${script_dir}/compose.yaml
die() { printf '[npr-qa-smoke] ERROR: %s\n' "$*" >&2; exit 1; }
env_file_value() {
  local file=$1 key=$2
  awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${file}"
}
assert_service_env() {
  local unit=$1 key=$2 expected=$3 pid
  pid=$(systemctl show --property=MainPID --value "${unit}")
  [[ ${pid} =~ ^[1-9][0-9]*$ ]] || die "${unit} has no running process"
  tr '\0' '\n' < "/proc/${pid}/environ" | grep -Fqx -- "${key}=${expected}" \
    || die "${unit} did not load ${key}=${expected}"
}
wait_http() {
  local url=$1 label=$2 expected=${3:-} response
  for _ in $(seq 1 30); do
    if response=$(curl --fail --silent --show-error --max-time 5 "${url}" 2>/dev/null) \
        && { [[ -z ${expected} ]] || [[ ${response} == *"${expected}"* ]]; }; then
      return 0
    fi
    sleep 2
  done
  die "${label} did not become ready within 60 seconds"
}
[[ $(hostname -s) == pve-dev ]] || die "refusing to run outside pve-dev"
[[ -r ${config_dir}/runtime.env ]] || die "run as root or grant read access to runtime.env"
set -a
# shellcheck disable=SC1090
source "${config_dir}/runtime.env"
set +a

running_services=$(docker compose --project-name npr-seminar-qa --env-file "${config_dir}/runtime.env" \
  -f "${compose_file}" ps --status running --services)
[[ ${running_services} == *postgres* ]] || die "PostgreSQL container is not running"
[[ ${running_services} == *redis* ]] || die "Redis container is not running"
wait_http http://127.0.0.1:4100/health/ready "API readiness" '"status":"ok"'
wait_http http://127.0.0.1:3100/ "web 3100"
wait_http http://127.0.0.1:3000/ "front door 3000"
wait_http http://127.0.0.1:3000/api/v1/public/seminar-sessions "front door Next rewrite to Nest API" '"items"'

counts=$(docker compose --project-name npr-seminar-qa --env-file "${config_dir}/runtime.env" -f "${compose_file}" \
  exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres psql -At -U npr_migrator -d npr_seminar_qa \
  -c "select (select count(*) from students),(select count(*) from student_class_assignments),(select count(*) from family_bookings),(select count(*) from scanner_devices),(select count(*) from sms_outbox),(select count(*) from sheet_outbox),(select count(*) from admin_users where role='ADMIN' and active),(select count(*) from admin_users where username='admin' and active),(select count(*) from sheet_mappings),(select count(*) from sheet_mappings where enabled and circuit_status='CLOSED' and schema_version=4)")
IFS='|' read -r students assignments bookings scanners sms_outbox sheet_outbox active_admins fixed_admins sheet_mappings active_sheet_mappings <<< "${counts}"
[[ ${students} == 3382 && ${assignments} == 3805 && ${active_admins} == 1 && ${fixed_admins} == 1 ]] \
  || die "unexpected immutable QA row counts: ${counts}"
[[ ${bookings} =~ ^[0-9]+$ && ${bookings} -ge 1517 ]] \
  || die "QA booking baseline is missing: ${counts}"

if [[ -e ${config_dir}/integrations-api.env || -e ${config_dir}/integrations-worker.env ]]; then
  readonly spreadsheet_id=1OPSt3laJ1p_1YKlxjgDoSIKhpQPHtVnlkYC9ESNWI7o
  [[ -r ${config_dir}/integrations-api.env && -r ${config_dir}/integrations-worker.env ]] \
    || die "QA integration overrides must be installed as an API/worker pair"
  for integration_file in integrations-api.env integrations-worker.env; do
    [[ $(env_file_value "${config_dir}/${integration_file}" SMS_ENABLED) == true ]] \
      || die "${integration_file} must enable SMS"
    [[ $(env_file_value "${config_dir}/${integration_file}" SMS_RECIPIENT_ALLOWLIST_ENABLED) == false ]] \
      || die "${integration_file} must disable the QA recipient allowlist"
    [[ $(env_file_value "${config_dir}/${integration_file}" SMS_ALIGO_TEST_MODE) == false ]] \
      || die "${integration_file} must use the real SMS provider mode"
  done
  [[ $(env_file_value "${config_dir}/integrations-worker.env" GOOGLE_SHEETS_ENABLED) == true ]] \
    || die "integrations-worker.env must enable Google Sheets"
  [[ $(env_file_value "${config_dir}/integrations-worker.env" GOOGLE_SHEETS_SPREADSHEET_ID) == "${spreadsheet_id}" ]] \
    || die "integrations-worker.env points outside the QA workbook"
  [[ ${sheet_mappings} == 6 && ${active_sheet_mappings} == 6 ]] \
    || die "expected six enabled schema-v4 QA Sheet mappings: ${counts}"
  for unit in npr-seminar-qa-api.service npr-seminar-qa-worker.service; do
    assert_service_env "${unit}" SMS_ENABLED true
    assert_service_env "${unit}" SMS_RECIPIENT_ALLOWLIST_ENABLED false
    assert_service_env "${unit}" SMS_ALIGO_TEST_MODE false
  done
  assert_service_env npr-seminar-qa-worker.service GOOGLE_SHEETS_ENABLED true
  assert_service_env npr-seminar-qa-worker.service GOOGLE_SHEETS_SPREADSHEET_ID "${spreadsheet_id}"
fi
printf '[npr-qa-smoke] containers, API, web and front-door rewrite are healthy (bookings=%s scanners=%s sms=%s sheets=%s).\n' \
  "${bookings}" "${scanners}" "${sms_outbox}" "${sheet_outbox}"
