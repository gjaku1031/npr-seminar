#!/usr/bin/env bash
set -Eeuo pipefail

# SAFETY CONTRACT:
# - exactly one credential-check request per READY state
# - zero curl retries
# - any rejected or ambiguous credential request opens the circuit
# - only an operator who has manually reset the upstream failure count may
#   return the circuit to READY

if [[ ${EUID} -ne 0 || $(hostname -s) != "pve-release" ]]; then
  echo "refusing to authenticate outside pve-release as root" >&2
  exit 1
fi

base_url=https://www9.hakwonsarang.co.kr
academy_code=SE8A
secret_dir=/etc/npr-seminar/secrets
state_dir=/var/lib/npr-seminar/tongtong
state_file=${state_dir}/auth.state
lock_file=${state_dir}/auth.lock
cookie_file=${state_dir}/session.cookies

install -d -o root -g npr -m 0750 "${state_dir}"
touch "${lock_file}"
chown root:npr "${lock_file}"
chmod 0640 "${lock_file}"

exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "authentication refused: another attempt is active" >&2
  exit 1
fi

write_state() {
  local next_state=$1
  local reason=$2
  local state_tmp
  state_tmp=$(mktemp "${state_dir}/.auth-state.XXXXXX")
  printf '%s\t%s\t%s\n' "${next_state}" "$(date --iso-8601=seconds)" "${reason}" > "${state_tmp}"
  chown root:npr "${state_tmp}"
  chmod 0640 "${state_tmp}"
  mv "${state_tmp}" "${state_file}"
}

if [[ ! -f ${state_file} ]]; then
  write_state READY initial
fi

current_state=$(cut -f1 "${state_file}")
if [[ ${current_state} != READY ]]; then
  echo "authentication refused: circuit state is ${current_state}" >&2
  exit 1
fi

username=$(<"${secret_dir}/tongtong-username")
password=$(<"${secret_dir}/tongtong-password")
if [[ -z ${username} || -z ${password} ]]; then
  echo "authentication refused: secret files are empty" >&2
  exit 1
fi

work_dir=$(mktemp -d /run/tongtong-auth.XXXXXX)
cleanup() {
  case ${work_dir} in
    /run/tongtong-auth.*) rm -rf -- "${work_dir}" ;;
    *) echo "refusing to remove unexpected auth work directory" >&2 ;;
  esac
  unset username password
}
trap cleanup EXIT

urlencode() {
  local value=$1
  local output=''
  local char hex index
  LC_ALL=C
  for ((index=0; index<${#value}; index++)); do
    char=${value:index:1}
    case ${char} in
      [a-zA-Z0-9.~_-]) output+=${char} ;;
      *) printf -v hex '%%%02X' "'${char}"; output+=${hex} ;;
    esac
  done
  printf '%s' "${output}"
}

credential_form=${work_dir}/credentials.form
printf 'txtmb_id=%s&txtmb_pw=%s&txtbr_code=%s' \
  "$(urlencode "${username}")" "$(urlencode "${password}")" "${academy_code}" > "${credential_form}"

curl_common=(
  --silent
  --show-error
  --retry 0
  --connect-timeout 10
  --max-time 30
  --cookie "${work_dir}/cookies"
  --cookie-jar "${work_dir}/cookies"
  --user-agent 'NPR-Student-Sync/1.0'
)

# This GET does not submit credentials. It establishes the ASP session cookie
# and must pass before consuming the single credential-check attempt.
if ! preflight_status=$(curl "${curl_common[@]}" \
  --output "${work_dir}/login.html" \
  --write-out '%{http_code}' \
  "${base_url}/mmsc/login.asp?acamcode=${academy_code}"); then
  echo "authentication preflight failed; no credentials were submitted" >&2
  exit 1
fi
if [[ ${preflight_status} != 200 ]]; then
  echo "authentication preflight returned HTTP ${preflight_status}; no credentials were submitted" >&2
  exit 1
fi

write_state ATTEMPTING credential_check_sent

if ! check_status=$(curl "${curl_common[@]}" \
  --request POST \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --header "Origin: ${base_url}" \
  --header "Referer: ${base_url}/mmsc/login.asp?acamcode=${academy_code}" \
  --data-binary "@${credential_form}" \
  --output "${work_dir}/credential-check.json" \
  --write-out '%{http_code}' \
  "${base_url}/mmsc/Login_security_Proc.asp"); then
  write_state OPEN credential_check_transport_ambiguous
  echo "credential check was ambiguous; circuit opened and no retry was made" >&2
  exit 1
fi

if [[ ${check_status} != 200 ]] || ! jq -e 'type == "array" and length > 0 and .[0].skey' "${work_dir}/credential-check.json" >/dev/null 2>&1; then
  write_state OPEN credential_check_response_ambiguous
  echo "credential check response was ambiguous; circuit opened and no retry was made" >&2
  exit 1
fi

result_code=$(jq -r '.[0].skey' "${work_dir}/credential-check.json")
if [[ ${result_code} != R9999 && ${result_code} != R9998 ]]; then
  safe_code=$(printf '%s' "${result_code}" | tr -cd 'A-Za-z0-9_-')
  write_state OPEN "credential_rejected_${safe_code:-unknown}"
  echo "credential check was rejected (${safe_code:-unknown}); circuit opened and no retry was made" >&2
  exit 1
fi

return_key=$(jq -r '.[0].retunkey // empty' "${work_dir}/credential-check.json")
return_key_pattern='^[^[:space:][:cntrl:]]+$'
if [[ -z ${return_key} || ${return_key} == *..* || ${return_key} == //* || ! ${return_key} =~ ${return_key_pattern} ]]; then
  write_state OPEN login_action_invalid
  echo "successful credential response contained an unsafe login action; circuit opened" >&2
  exit 1
fi

if [[ ${return_key} == "${base_url}/mmsc/"* ]]; then
  action_url=${return_key}
elif [[ ${return_key} == *://* ]]; then
  write_state OPEN login_action_cross_origin
  echo "successful credential response contained a cross-origin login action; circuit opened" >&2
  exit 1
elif [[ ${return_key} == /mmsc/* ]]; then
  action_url=${base_url}${return_key}
elif [[ ${return_key} == /* ]]; then
  write_state OPEN login_action_outside_mmsc
  echo "successful credential response contained an out-of-scope login action; circuit opened" >&2
  exit 1
else
  action_url=${base_url}/mmsc/${return_key#./}
fi

# This is the browser's confirmed CheckOK form submission that finalizes the
# already accepted credential check; it is not retried and remains same-origin.
if ! action_status=$(curl "${curl_common[@]}" \
  --request POST \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --header "Origin: ${base_url}" \
  --header "Referer: ${base_url}/mmsc/login.asp?acamcode=${academy_code}" \
  --data-binary "@${credential_form}" \
  --dump-header "${work_dir}/login-action.headers" \
  --output "${work_dir}/login-action.html" \
  --write-out '%{http_code}' \
  "${action_url}"); then
  write_state OPEN login_action_transport_ambiguous
  echo "login action was ambiguous; circuit opened and no retry was made" >&2
  exit 1
fi
if [[ ${action_status} != 200 && ${action_status} != 302 && ${action_status} != 303 ]]; then
  write_state OPEN "login_action_http_${action_status}"
  echo "login action returned HTTP ${action_status}; circuit opened and no retry was made" >&2
  exit 1
fi

if ! verify_status=$(curl "${curl_common[@]}" \
  --dump-header "${work_dir}/default.headers" \
  --output "${work_dir}/default.html" \
  --write-out '%{http_code}' \
  "${base_url}/mmsc/default.asp"); then
  write_state OPEN session_verification_transport_ambiguous
  echo "session verification was ambiguous; circuit opened and no retry was made" >&2
  exit 1
fi
if [[ ${verify_status} != 200 ]] || grep -Eaqi "name=['\"]txtmb_pw['\"]" "${work_dir}/default.html"; then
  write_state OPEN session_verification_failed
  echo "session verification failed; circuit opened and no retry was made" >&2
  exit 1
fi

if ! top_status=$(curl "${curl_common[@]}" \
  --output "${work_dir}/top.html" \
  --write-out '%{http_code}' \
  "${base_url}/mmsc/mmsc_top.asp?containeryn=Y"); then
  write_state OPEN positive_session_marker_transport_ambiguous
  echo "positive session verification was ambiguous; circuit opened and no retry was made" >&2
  exit 1
fi
if [[ ${top_status} != 200 ]] \
  || ! iconv -f cp949 -t utf-8 "${work_dir}/top.html" > "${work_dir}/top.utf8.html" 2>/dev/null \
  || ! grep -aFq 'targetranch_proc.asp' "${work_dir}/top.utf8.html" \
  || ! grep -aFq '님 환영합니다' "${work_dir}/top.utf8.html" \
  || ! grep -aEq '학원코드 : [A-Z0-9]+' "${work_dir}/top.utf8.html"; then
  write_state OPEN positive_session_marker_missing
  echo "positive session verification failed; circuit opened and no retry was made" >&2
  exit 1
fi

install -o root -g npr -m 0640 "${work_dir}/cookies" "${cookie_file}"
write_state AUTHENTICATED verified
echo "authentication=success credential_checks=1 retries=0"
