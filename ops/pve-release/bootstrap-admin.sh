#!/usr/bin/env bash
set -Eeuo pipefail

readonly release_root=/srv/npr-seminar
readonly current_link=${release_root}/current
readonly migration_env=/etc/npr-seminar/migration.env
readonly migrate_user=npr-migrate

username=seminar-admin
display_name=관리자
rotate=false
credential_file=
temporary_password_file=

log() {
  printf '[npr-admin] %s\n' "$*"
}

die() {
  printf '[npr-admin] ERROR: %s\n' "$*" >&2
  exit 1
}

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

cleanup() {
  if [[ -n ${temporary_password_file} ]]; then
    case ${temporary_password_file} in
      /run/npr-admin-password.*) rm -f -- "${temporary_password_file}" ;;
      *) printf '[npr-admin] refusing to clean unexpected temporary path\n' >&2 ;;
    esac
  fi
}
trap cleanup EXIT

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

exec 9>/run/lock/npr-seminar-admin.lock
flock -n 9 || die 'another administrator bootstrap is running'

migration_url=$(env_value "${migration_env}" MIGRATION_DATABASE_URL)
[[ -n ${migration_url} ]] || die 'MIGRATION_DATABASE_URL is missing'

umask 077
temporary_password_file=$(mktemp /run/npr-admin-password.XXXXXX)
password="Npr!$(openssl rand -hex 24)Aa7"
printf '%s' "${password}" > "${temporary_password_file}"

command_arguments=()
if [[ ${rotate} == true ]]; then
  command_arguments+=(--rotate)
fi

result=$(runuser -u "${migrate_user}" -- env \
  NODE_ENV=production APP_ENV=local PROCESS_ROLE=api DATABASE_URL="${migration_url}" \
  ADMIN_BOOTSTRAP_USERNAME="${username}" ADMIN_BOOTSTRAP_DISPLAY_NAME="${display_name}" \
  ADMIN_BOOTSTRAP_PASSWORD_FD=3 \
  /usr/bin/node "${command_path}" "${command_arguments[@]}" \
  3<"${temporary_password_file}")

action=$(jq -er '.action' <<<"${result}") || die 'administrator command returned an invalid result'
case ${action} in
  CREATED|ROTATED) ;;
  UNCHANGED)
    die 'administrator already exists; use --rotate only for an intentional password rotation'
    ;;
  *) die "administrator command returned an unexpected action: ${action}" ;;
esac

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
