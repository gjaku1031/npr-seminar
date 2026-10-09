#!/usr/bin/env bash
# 통통통 원천에 한 번만 로그인해 세션 쿠키를 저장. 원천 계정 잠금을 피하려고 회로(state 파일)로 재시도를 막음
# 실행: pve-release 에서 root 로 인자 없이 실행. install-tongtong-secrets.sh 로 자격을 먼저 설치
# 종료 코드: 0 인증·세션 확인 완료(AUTHENTICATED), 1 실행 위치·잠금·회로 상태·자격 누락 또는 인증 실패(회로 OPEN)
set -Eeuo pipefail

# 안전 계약
# - READY 상태 한 번에 자격 확인 요청은 정확히 한 번
# - curl 재시도 0회
# - 거절되거나 결과가 모호한 자격 요청은 회로를 엶(OPEN)
# - 원천의 실패 횟수를 직접 초기화한 운영자만 회로를 READY 로 되돌릴 수 있음

# pve-release root 에서만 실행
if [[ ${EUID} -ne 0 || $(hostname -s) != "pve-release" ]]; then
  echo "refusing to authenticate outside pve-release as root" >&2
  exit 1
fi

# 원천 주소·학원 코드와 상태·잠금·쿠키 파일 경로
base_url=https://www9.hakwonsarang.co.kr
academy_code=SE8A
secret_dir=/etc/npr-seminar/secrets
state_dir=/var/lib/npr-seminar/tongtong
state_file=${state_dir}/auth.state
lock_file=${state_dir}/auth.lock
cookie_file=${state_dir}/session.cookies

# 상태 디렉터리와 잠금 파일. 동시 시도 방지
install -d -o root -g npr -m 0750 "${state_dir}"
touch "${lock_file}"
chown root:npr "${lock_file}"
chmod 0640 "${lock_file}"

exec 9>"${lock_file}"
if ! flock -n 9; then
  echo "authentication refused: another attempt is active" >&2
  exit 1
fi

# 회로 상태를 시각·사유와 함께 원자적으로 기록
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

# 상태 파일이 없으면 READY 로 시작하고, READY 가 아니면 거절
if [[ ! -f ${state_file} ]]; then
  write_state READY initial
fi

current_state=$(cut -f1 "${state_file}")
if [[ ${current_state} != READY ]]; then
  echo "authentication refused: circuit state is ${current_state}" >&2
  exit 1
fi

# 자격 파일 읽기
username=$(<"${secret_dir}/tongtong-username")
password=$(<"${secret_dir}/tongtong-password")
if [[ -z ${username} || -z ${password} ]]; then
  echo "authentication refused: secret files are empty" >&2
  exit 1
fi

# 임시 작업 디렉터리. 끝나면 이 경로만 지우고 자격 변수를 비움
work_dir=$(mktemp -d /run/tongtong-auth.XXXXXX)
cleanup() {
  case ${work_dir} in
    /run/tongtong-auth.*) rm -rf -- "${work_dir}" ;;
    *) echo "refusing to remove unexpected auth work directory" >&2 ;;
  esac
  unset username password
}
trap cleanup EXIT

# 폼 값 퍼센트 인코딩
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

# 로그인 폼 본문과 공통 curl 옵션(재시도 없음)
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

# 이 GET 은 자격을 보내지 않음. ASP 세션 쿠키를 만들고, 통과해야 한 번뿐인 자격 확인을 씀
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

# 자격 확인 요청 직전에 시도 중 상태를 남김. 이후 실패는 모두 회로를 엶
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

# 응답 형식과 결과 코드 확인. R9999·R9998 만 성공
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

# 응답의 로그인 action 경로가 같은 원천 /mmsc 아래인지 확인
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

# 이미 통과한 자격 확인을 마무리하는 브라우저의 CheckOK 폼 제출. 재시도하지 않고 같은 출처로만 보냄
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

# 기본 화면이 로그인 폼이 아닌지로 세션 확인
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

# 상단 프레임의 환영 문구·학원 코드로 세션을 한 번 더 확인
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

# 쿠키 저장 후 AUTHENTICATED 기록
install -o root -g npr -m 0640 "${work_dir}/cookies" "${cookie_file}"
write_state AUTHENTICATED verified
echo "authentication=success credential_checks=1 retries=0"
