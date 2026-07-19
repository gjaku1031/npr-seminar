#!/usr/bin/env bash
set -Eeuo pipefail

readonly runtime_env=/etc/npr-seminar/runtime.env

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

IFS= read -r aligo_identifier
IFS= read -r aligo_key
IFS= read -r test_recipient
IFS= read -r sender_campus_a
IFS= read -r sender_campus_b
IFS= read -r sender_campus_c
IFS= read -r aligo_test_mode

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

runtime_tmp=$(mktemp /etc/npr-seminar/.runtime.env.sms.XXXXXX)
cleanup() {
  rm -f -- "${runtime_tmp}"
  restore_terminal
}
trap cleanup EXIT

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
