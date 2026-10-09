#!/usr/bin/env bash
# 알리고 자격·발신 번호·테스트 수신자를 runtime.env 에 설치. 수신 허용 목록(테스트 번호 하나)을 켠 상태로 씀
# 실행: pve-release 에서 root 로 실행하고 표준 입력에 7줄을 순서대로 넣음
#   알리고 ID, 알리고 키, 테스트 수신 번호, A·B·C 발신 번호, 알리고 테스트 모드(true|false)
#   실제 반영은 다음 배포 때 이뤄짐
# 종료 코드: 0 설치 완료, 1 실행 위치·runtime.env 권한·입력 형식 오류
set -Eeuo pipefail

# 대상 env 파일
readonly runtime_env=/etc/npr-seminar/runtime.env

# pve-release root 와 runtime.env 권한 확인
if [[ ${EUID} -ne 0 || $(hostname -s) != pve-release ]]; then
  echo "refusing to install SMS secrets outside pve-release as root" >&2
  exit 1
fi
if [[ ! -f ${runtime_env} || -L ${runtime_env} ]]; then
  echo "missing regular runtime environment: ${runtime_env}" >&2
  exit 1
fi
if [[ $(stat -c '%u:%g:%a' "${runtime_env}") != 0:0:600 ]]; then
  echo "${runtime_env} must be root:root mode 0600" >&2
  exit 1
fi

# 터미널 입력이면 비밀값이 보이지 않게 echo 를 끄고 종료 시 되돌림
terminal_echo_disabled=false
if [[ -t 0 ]]; then
  stty -echo
  terminal_echo_disabled=true
fi
restore_terminal() {
  if [[ ${terminal_echo_disabled} == true ]]; then
    stty echo
  fi
}
trap restore_terminal EXIT

# 표준 입력에서 7개 값을 읽음
IFS= read -r aligo_identifier
IFS= read -r aligo_key
IFS= read -r test_recipient
IFS= read -r sender_campus_a
IFS= read -r sender_campus_b
IFS= read -r sender_campus_c
IFS= read -r aligo_test_mode

# 자격 형식 확인, 번호는 숫자만 남겨 길이 확인
for secret_value in "${aligo_identifier}" "${aligo_key}"; do
  if [[ -z ${secret_value} || ! ${secret_value} =~ ^[A-Za-z0-9._-]+$ ]]; then
    echo "Aligo credentials must be non-empty environment-safe tokens" >&2
    exit 1
  fi
done
for phone_value in test_recipient sender_campus_a sender_campus_b sender_campus_c; do
  current_phone_value=${!phone_value}
  normalized=${current_phone_value//[^0-9]/}
  printf -v "${phone_value}" '%s' "${normalized}"
done
if [[ ${#test_recipient} -lt 8 || ${#test_recipient} -gt 15 ]]; then
  echo "the test recipient is invalid" >&2
  exit 1
fi
for sender_value in "${sender_campus_a}" "${sender_campus_b}" "${sender_campus_c}"; do
  if [[ ${#sender_value} -lt 8 || ${#sender_value} -gt 16 ]]; then
    echo "an SMS sender is invalid" >&2
    exit 1
  fi
done
if [[ ${aligo_test_mode} != true && ${aligo_test_mode} != false ]]; then
  echo "Aligo test mode must be true or false" >&2
  exit 1
fi

# 임시 파일. 끝나면 지움
runtime_tmp=$(mktemp /etc/npr-seminar/.runtime.env.sms.XXXXXX)
cleanup() {
  rm -f -- "${runtime_tmp}"
  restore_terminal
}
trap cleanup EXIT

# 기존 문자 관련 키를 지우고 새 값을 덧붙임
awk -F= '
  BEGIN {
    wanted["ALIGO_IDENTIFIER"]=1
    wanted["ALIGO_KEY"]=1
    wanted["SMS_ENABLED"]=1
    wanted["SMS_RECIPIENT_ALLOWLIST_ENABLED"]=1
    wanted["SMS_TEST_RECIPIENTS"]=1
    wanted["SMS_SENDER_CAMPUS_A"]=1
    wanted["SMS_SENDER_CAMPUS_B"]=1
    wanted["SMS_SENDER_CAMPUS_C"]=1
    wanted["SMS_ALIGO_TEST_MODE"]=1
  }
  !($1 in wanted) { print }
' "${runtime_env}" > "${runtime_tmp}"
printf '%s\n' \
  "ALIGO_IDENTIFIER=${aligo_identifier}" \
  "ALIGO_KEY=${aligo_key}" \
  'SMS_ENABLED=true' \
  'SMS_RECIPIENT_ALLOWLIST_ENABLED=true' \
  "SMS_TEST_RECIPIENTS=${test_recipient}" \
  "SMS_SENDER_CAMPUS_A=${sender_campus_a}" \
  "SMS_SENDER_CAMPUS_B=${sender_campus_b}" \
  "SMS_SENDER_CAMPUS_C=${sender_campus_c}" \
  "SMS_ALIGO_TEST_MODE=${aligo_test_mode}" >> "${runtime_tmp}"

# 권한을 맞추고 기존 파일을 백업한 뒤 원자적으로 교체
chown root:root "${runtime_tmp}"
chmod 0600 "${runtime_tmp}"
backup=${runtime_env}.bak.$(date -u +%Y%m%dT%H%M%SZ)
if [[ -e ${backup} ]]; then
  backup=${backup}.$$
fi
cp -a -- "${runtime_env}" "${backup}"
chown root:root "${backup}"
chmod 0600 "${backup}"
mv -fT -- "${runtime_tmp}" "${runtime_env}"

unset aligo_identifier aligo_key test_recipient sender_campus_a sender_campus_b sender_campus_c
trap restore_terminal EXIT
echo "SMS credentials installed with one-recipient allowlist; deploy to activate"
