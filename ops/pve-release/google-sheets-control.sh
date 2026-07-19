#!/usr/bin/env bash
set -euo pipefail

readonly worker_service=npr-seminar-worker.service
readonly worker_env=/etc/npr-seminar/worker.env
readonly credential_path=/etc/npr-seminar/google-service-account.json
readonly app_dir=/srv/npr-seminar/current/apps/api
readonly command_path=${app_dir}/dist/modules/google-sheets/sheet-mapping-control.command.js
readonly expected_host=pve-release
readonly deploy_lock=/run/lock/npr-seminar-deploy.lock

die() {
  printf '[npr-sheets-control] %s\n' "$*" >&2
  exit 1
}

env_value() {
  local key=$1
  awk -v key="${key}" 'index($0,key "=")==1 { print substr($0,length(key)+2); exit }' "${worker_env}"
}

[[ ${EUID} -eq 0 ]] || die "run as root"
[[ $(hostname -s) == "${expected_host}" ]] || die "refusing to run outside ${expected_host}"
for command_name in flock hostname readlink; do
  command -v "${command_name}" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
done
if [[ ${NPR_DEPLOY_LOCK_HELD:-false} == true ]]; then
  [[ $(readlink -f /proc/self/fd/9 2>/dev/null || true) == "${deploy_lock}" ]] \
    || die "deployment lock inheritance is invalid"
  flock -n 9 || die "deployment lock inheritance is not held"
else
  exec 8>"${deploy_lock}"
  flock -n 8 || die "another NPR deployment or reset is running"
fi
[[ $# -eq 3 ]] || die "usage: $0 prepare|enable MAPPING_UUID CONFIRMED_SPREADSHEET_ID"
readonly mode=$1
readonly mapping_id=$2
readonly confirmed_spreadsheet_id=$3
[[ ${mode} == prepare || ${mode} == enable ]] || die "mode must be prepare or enable"
[[ ${mapping_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] \
  || die "mapping ID must be a UUIDv4"
[[ ${confirmed_spreadsheet_id} =~ ^[A-Za-z0-9_-]{20,160}$ ]] || die "invalid spreadsheet ID"
[[ -f ${worker_env} && ! -L ${worker_env} && $(stat -c '%U:%G:%a' "${worker_env}") == root:root:600 ]] \
  || die "worker environment must be a root-owned 0600 regular file"
[[ -f ${command_path} && ! -L ${command_path} ]] || die "deployed Sheets control command is missing"

readonly configured_spreadsheet_id=$(env_value GOOGLE_SHEETS_SPREADSHEET_ID)
readonly configured_credential_path=$(env_value GOOGLE_APPLICATION_CREDENTIALS)
readonly configured_enabled=$(env_value GOOGLE_SHEETS_ENABLED)
[[ ${configured_spreadsheet_id} == "${confirmed_spreadsheet_id}" ]] || die "spreadsheet confirmation does not match worker configuration"
[[ ${configured_credential_path} == "${credential_path}" ]] || die "worker credential path is not the approved path"
[[ -f ${credential_path} && ! -L ${credential_path} ]] || die "Google credential must be a regular non-symlink file"
[[ $(stat -c '%U:%G:%a' "${credential_path}") == npr-worker:npr-worker:600 ]] \
  || die "Google credential must be npr-worker:npr-worker mode 0600"
if [[ ${mode} == enable && ${configured_enabled} != true ]]; then
  die "enable requires GOOGLE_SHEETS_ENABLED=true in worker.env"
fi

worker_was_active=false
worker_initial_state=$(systemctl is-active "${worker_service}" 2>/dev/null || true)
case ${worker_initial_state} in
  active) worker_was_active=true ;;
  inactive|failed) ;;
  *) die "${worker_service} is in transient state ${worker_initial_state:-unknown}" ;;
esac
restore_worker() {
  local result=$?
  trap - EXIT
  if [[ ${worker_was_active} == true ]]; then
    if ! systemctl start "${worker_service}" || ! systemctl is-active --quiet "${worker_service}"; then
      printf '[npr-sheets-control] failed to restore %s\n' "${worker_service}" >&2
      result=1
    fi
  else
    printf '[npr-sheets-control] %s was %s; leaving it unchanged\n' "${worker_service}" "${worker_initial_state}" >&2
  fi
  exit "${result}"
}
trap restore_worker EXIT

if [[ ${worker_was_active} == true ]]; then
  systemctl stop "${worker_service}"
  systemctl is-active --quiet "${worker_service}" && die "failed to stop ${worker_service}"
fi

systemd-run --quiet --wait --pipe --collect \
  --unit=npr-seminar-sheets-control \
  --service-type=exec \
  --uid=npr-worker \
  --gid=npr-worker \
  --working-directory="${app_dir}" \
  --property="EnvironmentFile=${worker_env}" \
  --setenv=NODE_ENV=production \
  --setenv=APP_ENV=production \
  --setenv=PROCESS_ROLE=worker \
  --property=NoNewPrivileges=true \
  --property=PrivateDevices=true \
  --property=PrivateTmp=true \
  --property=ProtectSystem=strict \
  --property="ReadOnlyPaths=${credential_path}" \
  /usr/bin/node "${command_path}" \
  "--mode=${mode}" \
  "--mapping-id=${mapping_id}" \
  "--confirm-spreadsheet-id=${confirmed_spreadsheet_id}"
