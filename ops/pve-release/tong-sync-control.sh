#!/usr/bin/env bash
# 통통통 학생 동기화 켜기·끄기. api.env·runtime.env 의 활성화 두 값을 바꾸고 API 재시작. 원천에 요청하지 않음
# 실행: pve-release 에서 root 로 tong-sync-control.sh enable|disable
# 종료 코드: 0 반영 완료, 1 사전 조건 실패·배포 진행 중·API 재시작 실패(이전 설정으로 복구)
set -Eeuo pipefail

# 대상 파일과 서비스
readonly api_env=/etc/npr-seminar/api.env
readonly runtime_env=/etc/npr-seminar/runtime.env
readonly service=npr-seminar-api.service

# 오류를 출력하고 종료 코드 1로 끝냄
die() { printf 'tong sync control: %s\n' "$*" >&2; exit 1; }

# 실행 위치·인자·env 파일 권한 확인
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

# 필요한 명령과 env 키가 정확히 하나씩 있는지 확인
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

# 배포와 동시에 실행하지 않음
exec 8>/run/lock/npr-seminar-deploy.lock
flock -n 8 || die "an NPR deployment is active"
exec 9>/run/lock/npr-seminar-tong-sync-control.lock
flock -n 9 || die "another Tong sync control operation is active"

# 임시 파일과 복구용 사본. 중간에 실패하면 사본으로 되돌리고 API 재시작
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

# 두 키를 지우고 새 값으로 다시 써서 임시 파일 생성
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

# 원자적으로 교체
rollback_required=true
mv -fT -- "${runtime_temp}" "${runtime_env}"
mv -fT -- "${api_temp}" "${api_env}"

# API 가 새 설정으로 뜨지 않으면 이전 설정으로 복구
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
