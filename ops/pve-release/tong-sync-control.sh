#!/usr/bin/env bash
set -Eeuo pipefail

readonly api_env=/etc/npr-seminar/api.env
readonly runtime_env=/etc/npr-seminar/runtime.env
readonly service=npr-seminar-api.service

die() { printf 'tong sync control: %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 && $(hostname -s) == pve-release ]] \
  || die "refusing to run outside pve-release as root"
[[ $# -eq 1 && ( $1 == enable || $1 == disable ) ]] \
  || die "usage: tong-sync-control.sh enable|disable"
for environment_file in "${api_env}" "${runtime_env}"; do
  [[ -f ${environment_file} && ! -L ${environment_file} ]] \
    || die "missing regular environment: ${environment_file}"
  [[ $(stat -c '%u:%g:%a' "${environment_file}") == 0:0:600 ]] \
    || die "${environment_file} must be root:root mode 0600"
done

for command_name in awk chmod chown cp flock hostname mktemp mv rm stat systemctl; do
  command -v "${command_name}" >/dev/null 2>&1 || die "required command is missing: ${command_name}"
done
for key in TONG_SYNC_ENABLED TONG_WIRE_CONTRACT_CONFIRMED; do
  for environment_file in "${runtime_env}" "${api_env}"; do
    [[ $(awk -F= -v wanted="${key}" '$1 == wanted { count++ } END { print count+0 }' "${environment_file}") -eq 1 ]] \
      || die "${environment_file} must contain exactly one ${key}"
  done
done
for key in TONG_WIRE_CONTRACT_JSON TONG_BASE_URL TONG_USERNAME TONG_PASSWORD; do
  [[ $(awk -F= -v wanted="${key}" '$1 == wanted { count++ } END { print count+0 }' "${api_env}") -eq 1 ]] \
    || die "API environment must contain exactly one ${key}"
done

exec 8>/run/lock/npr-seminar-deploy.lock
flock -n 8 || die "an NPR deployment is active"
exec 9>/run/lock/npr-seminar-tong-sync-control.lock
flock -n 9 || die "another Tong sync control operation is active"

api_temp=$(mktemp /etc/npr-seminar/.api.env.tong.XXXXXX)
runtime_temp=$(mktemp /etc/npr-seminar/.runtime.env.tong.XXXXXX)
api_rollback=$(mktemp /etc/npr-seminar/.api.env.tong-rollback.XXXXXX)
runtime_rollback=$(mktemp /etc/npr-seminar/.runtime.env.tong-rollback.XXXXXX)
rollback_required=false
cleanup() {
  if [[ ${rollback_required} == true ]]; then
    mv -fT -- "${runtime_rollback}" "${runtime_env}" 2>/dev/null || true
    mv -fT -- "${api_rollback}" "${api_env}" 2>/dev/null || true
    systemctl restart "${service}" >/dev/null 2>&1 || true
  fi
  rm -f -- "${api_temp}" "${runtime_temp}" "${api_rollback}" "${runtime_rollback}"
}
trap cleanup EXIT
cp --preserve=mode,ownership,timestamps -- "${api_env}" "${api_rollback}"
cp --preserve=mode,ownership,timestamps -- "${runtime_env}" "${runtime_rollback}"
chown root:root "${api_rollback}" "${runtime_rollback}"
chmod 0600 "${api_rollback}" "${runtime_rollback}"

enabled=false
confirmed=false
if [[ $1 == enable ]]; then enabled=true; confirmed=true; fi
for source_and_temp in "${runtime_env}:${runtime_temp}" "${api_env}:${api_temp}"; do
  source=${source_and_temp%%:*}
  temp=${source_and_temp#*:}
  awk -F= '$1 != "TONG_SYNC_ENABLED" && $1 != "TONG_WIRE_CONTRACT_CONFIRMED" { print }' "${source}" > "${temp}"
  printf "TONG_SYNC_ENABLED='%s'\nTONG_WIRE_CONTRACT_CONFIRMED='%s'\n" "${enabled}" "${confirmed}" >> "${temp}"
  chown root:root "${temp}"
  chmod 0600 "${temp}"
done

rollback_required=true
mv -fT -- "${runtime_temp}" "${runtime_env}"
mv -fT -- "${api_temp}" "${api_env}"

if ! systemctl restart "${service}" || ! systemctl is-active --quiet "${service}"; then
  mv -fT -- "${runtime_rollback}" "${runtime_env}"
  mv -fT -- "${api_rollback}" "${api_env}"
  rollback_required=false
  systemctl restart "${service}" >/dev/null 2>&1 || true
  die "API restart failed; the prior persistent Tong configuration was restored"
fi
rollback_required=false
rm -f -- "${api_rollback}" "${runtime_rollback}"
trap - EXIT
printf 'tong sync configuration=%s persisted; no upstream request was made\n' "$1"
