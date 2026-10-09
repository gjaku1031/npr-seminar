#!/usr/bin/env bash
# 운영 첫 관리자 계정 생성 또는 --rotate 로 비밀번호 교체. 새 비밀번호는 /root 아래 root 전용 파일에 한 번만 기록
# 실행: pve-release 에서 root 로 bootstrap-admin.sh [--rotate] [--username NAME] [--display-name NAME]
#   비밀번호는 보호된 파일 디스크립터(3)로 Nest 명령에 넘기고 출력·argv 에 남기지 않음
# 종료 코드: 0 생성·교체 완료(--help 포함), 1 인자·사전 조건 오류·이미 있는 계정·명령 결과 이상
set -Eeuo pipefail

# 릴리스 경로와 마이그레이션 계정
readonly release_root=/srv/npr-seminar
readonly current_link=${release_root}/current
readonly migration_env=/etc/npr-seminar/migration.env
readonly migrate_user=npr-migrate

# 기본 계정 값
username=seminar-admin
display_name=관리자
rotate=false
credential_file=
temporary_password_file=

# 진행 메시지 출력
log() {
  printf '[npr-admin] %s\n' "$*"
}

# 오류를 출력하고 종료 코드 1로 끝냄
die() {
  printf '[npr-admin] ERROR: %s\n' "$*" >&2
  exit 1
}

# 사용법 출력
usage() {
  cat <<'USAGE'
Usage:
  bootstrap-admin.sh [--rotate] [--username NAME] [--display-name NAME]

Creates the first administrator, or rotates it only when --rotate is supplied.
A generated credential is written once to a root-only file under /root. The
password is passed to the Nest command through a protected file descriptor and
is never printed or placed in argv.
USAGE
}

# 임시 비밀번호 파일 정리. 예상 경로일 때만 지움
cleanup() {
  if [[ -n ${temporary_password_file} ]]; then
    case ${temporary_password_file} in
      /run/npr-admin-password.*) rm -f -- "${temporary_password_file}" ;;
      *) printf '[npr-admin] refusing to clean unexpected temporary path\n' >&2 ;;
    esac
  fi
}
trap cleanup EXIT

# env 파일에서 키 값 읽기. 주석·빈 줄은 건너뛰고 따옴표는 벗김
env_value() {
  local file=$1
  local wanted=$2
  awk -v wanted="${wanted}" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/^[[:space:]]*/, "", line)
      equals=index(line, "=")
      if (equals == 0) next
      key=substr(line, 1, equals-1)
      sub(/[[:space:]]*$/, "", key)
      if (key == wanted) value=substr(line, equals+1)
    }
    END {
      sub(/^[[:space:]]*/, "", value)
      sub(/[[:space:]]*$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^\047.*\047$/) value=substr(value, 2, length(value)-2)
      printf "%s", value
    }
  ' "${file}"
}

# 인자 해석
while [[ $# -gt 0 ]]; do
  case $1 in
    --rotate)
      rotate=true
      shift
      ;;
    --username)
      [[ $# -ge 2 ]] || die '--username requires a value'
      username=$2
      shift 2
      ;;
    --display-name)
      [[ $# -ge 2 ]] || die '--display-name requires a value'
      display_name=$2
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *) die "unknown argument: $1" ;;
  esac
done

# 실행 위치·필요 명령·현재 릴리스·마이그레이션 env 확인
[[ ${EUID} -eq 0 ]] || die 'run as root'
[[ $(hostname -s) == pve-release ]] || die 'refusing to run outside pve-release'
for required_command in awk date flock getent jq mktemp node openssl readlink runuser stat; do
  command -v "${required_command}" >/dev/null 2>&1 || die "required command is missing: ${required_command}"
done
getent passwd "${migrate_user}" >/dev/null || die "missing system account: ${migrate_user}"
[[ -L ${current_link} ]] || die 'no active release exists'
release=$(readlink -f -- "${current_link}")
case ${release} in
  "${release_root}"/releases/*) ;;
  *) die 'active release resolves outside the release directory' ;;
esac
command_path=${release}/apps/api/dist/commands/bootstrap-admin.js
[[ -f ${command_path} ]] || die 'the active release does not contain the administrator command'
[[ -f ${migration_env} && ! -L ${migration_env} ]] || die 'missing regular migration environment file'
[[ $(stat -c '%u:%g:%a' "${migration_env}") == 0:0:600 ]] \
  || die 'migration environment file must be root:root mode 0600'

# 동시 실행 방지
exec 9>/run/lock/npr-seminar-admin.lock
flock -n 9 || die 'another administrator bootstrap is running'

# 마이그레이션 DB URL 로 Nest 관리자 명령 실행
migration_url=$(env_value "${migration_env}" MIGRATION_DATABASE_URL)
[[ -n ${migration_url} ]] || die 'MIGRATION_DATABASE_URL is missing'

# 무작위 비밀번호를 /run 임시 파일에 씀
umask 077
temporary_password_file=$(mktemp /run/npr-admin-password.XXXXXX)
password="Npr!$(openssl rand -hex 24)Aa7"
printf '%s' "${password}" > "${temporary_password_file}"

command_arguments=()
if [[ ${rotate} == true ]]; then
  command_arguments+=(--rotate)
fi

# 마이그레이션 계정으로 명령 실행. 비밀번호는 fd 3 으로 전달
result=$(runuser -u "${migrate_user}" -- env \
  NODE_ENV=production APP_ENV=local PROCESS_ROLE=api DATABASE_URL="${migration_url}" \
  ADMIN_BOOTSTRAP_USERNAME="${username}" ADMIN_BOOTSTRAP_DISPLAY_NAME="${display_name}" \
  ADMIN_BOOTSTRAP_PASSWORD_FD=3 \
  /usr/bin/node "${command_path}" "${command_arguments[@]}" \
  3<"${temporary_password_file}")

# 결과 확인. 이미 있으면(UNCHANGED) 실패로 끝냄
action=$(jq -er '.action' <<<"${result}") || die 'administrator command returned an invalid result'
case ${action} in
  CREATED|ROTATED) ;;
  UNCHANGED)
    die 'administrator already exists; use --rotate only for an intentional password rotation'
    ;;
  *) die "administrator command returned an unexpected action: ${action}" ;;
esac

# 자격을 root 전용 파일에 기록
credential_file=/root/npr-seminar-admin-$(date -u +%Y%m%dT%H%M%SZ).txt
[[ ! -e ${credential_file} ]] || die 'credential output path already exists'
{
  printf 'username=%s\n' "${username}"
  printf 'display_name=%s\n' "${display_name}"
  printf 'password=%s\n' "${password}"
} > "${credential_file}"
chmod 0600 "${credential_file}"
password=

log "administrator ${action,,}; credentials saved to ${credential_file} (root:root 0600)"
log 'retrieve the credential over SSH, sign in once, then securely delete the file'
