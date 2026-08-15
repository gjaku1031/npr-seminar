#!/usr/bin/env bash
set -Eeuo pipefail

readonly release_root=/srv/npr-seminar
readonly releases_dir=${release_root}/releases
readonly current_link=${release_root}/current
readonly previous_link=${release_root}/previous
readonly web_deferred_marker=${release_root}/.web-deferred-release
readonly config_dir=/etc/npr-seminar
readonly runtime_env=${config_dir}/runtime.env
readonly api_env=${config_dir}/api.env
readonly worker_env=${config_dir}/worker.env
readonly web_env=${config_dir}/web.env
readonly migration_env=${config_dir}/migration.env
readonly tong_secret_dir=${config_dir}/secrets
readonly tong_username_file=${tong_secret_dir}/tongtong-username
readonly tong_password_file=${tong_secret_dir}/tongtong-password
readonly tong_base_url=https://www9.hakwonsarang.co.kr
readonly api_user=npr-api
readonly web_user=npr-web
readonly worker_user=npr-worker
readonly build_user=npr-build
readonly migrate_user=npr-migrate
readonly nest_origin=http://127.0.0.1:4000
readonly default_public_base_url=https://survey.npredu.co.kr
readonly poster_storage_dir=/var/lib/npr-seminar/poster
readonly caddy_upstream_listener=10.10.10.165:3001
readonly caddy_upstream_socket=npr-seminar-caddy-upstream.socket
readonly caddy_upstream_service=npr-seminar-caddy-upstream.service
readonly corepack_version=0.34.7
readonly corepack_tarball_url=https://registry.npmjs.org/corepack/-/corepack-0.34.7.tgz
readonly corepack_sha512=d5OLuTNh4zeJK8+u+G10KScqrnHKNNm6NvR4XO28FZyBFMGE60SNCrBetJLyKR9H1xGCG6U2LyswsyPNdO6kxw==
readonly corepack_install_dir=${release_root}/.tooling/corepack-${corepack_version}
readonly corepack_entry=${corepack_install_dir}/dist/corepack.js
readonly corepack_home=${release_root}/.corepack-${corepack_version}-pnpm-11.10.0
readonly expected_pnpm_version=11.10.0
readonly sheets_v4_fingerprint=a89087d355e8b9e1cd1039fabc1fa715d8473ebf08ed55f164a844f437b789be
readonly -a deployment_units=(
  npr-seminar-api.service
  npr-seminar-web.service
  npr-seminar-worker.service
  npr-seminar-caddy-upstream.socket
  npr-seminar-caddy-upstream.service
)

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly tong_wire_contract=${script_dir}/tong-wire-contract.production.json
unit_source_dir=${script_dir}/systemd
source_dir=$(readlink -f -- "${script_dir}/../..")
stamp=$(date -u +%Y%m%dT%H%M%SZ)
run_migrations=true
defer_web=false
cleanup_path=
tong_environment_temp=

log() {
  printf '[npr-deploy] %s\n' "$*"
}

die() {
  printf '[npr-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage:
  deploy-nest-release.sh deploy [--source DIR] [--stamp YYYYMMDDTHHMMSSZ] [--skip-migrations] [--defer-web]
  deploy-nest-release.sh activate-web
  deploy-nest-release.sh rollback [STAMP]

Deploy builds a new immutable release, backs up and migrates PostgreSQL by
default, atomically switches /srv/npr-seminar/current, and automatically
returns to the previous code release if readiness checks fail.

--defer-web activates and verifies only the API and worker, leaves the web
service stopped, and records the exact deferred release. After Sheets v4 is
prepared, cleared, and enabled, activate-web revalidates every Sheet mapping
through the current worker code before starting web and verifying public HTTPS.

Rollback switches code only. It never reverses a database migration.
USAGE
}

cleanup() {
  if [[ -n ${tong_environment_temp} ]]; then
    case ${tong_environment_temp} in
      "${config_dir}"/.api.env.tong.*) rm -f -- "${tong_environment_temp}" ;;
      *) printf '[npr-deploy] refusing to clean unexpected Tong environment path: %s\n' "${tong_environment_temp}" >&2 ;;
    esac
  fi
  if [[ -n ${cleanup_path} ]]; then
    case ${cleanup_path} in
      "${releases_dir}"/.incoming-*) rm -rf -- "${cleanup_path}" ;;
      "${release_root}"/.tooling/.incoming-corepack-*) rm -rf -- "${cleanup_path}" ;;
      *) printf '[npr-deploy] refusing to clean unexpected path: %s\n' "${cleanup_path}" >&2 ;;
    esac
  fi
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command is missing: $1"
}

require_root_and_target() {
  [[ ${EUID} -eq 0 ]] || die "run as root"
  [[ $(hostname -s) == pve-release ]] || die "refusing to run outside pve-release"
}

require_tools() {
  local command_name
  for command_name in awk basename chmod chown cmp cp curl dirname flock getent grep \
      hostname id install ln mktemp mv node openssl psql readlink rm rmdir runuser sleep ss stat \
      systemctl systemd-analyze tar timeout tr useradd; do
    require_command "${command_name}"
  done
  [[ -x /usr/bin/node ]] || die "/usr/bin/node is required by the systemd units"
  [[ -x /usr/lib/systemd/systemd-socket-proxyd ]] \
    || die "/usr/lib/systemd/systemd-socket-proxyd is required by the Caddy upstream unit"
  [[ $(node -p 'Number(process.versions.node.split(".")[0])') -ge 22 ]] \
    || die "Node.js 22 or newer is required"
}

ensure_system_user() {
  local name=$1
  local home=$2
  if getent passwd "${name}" >/dev/null; then
    local shell
    shell=$(getent passwd "${name}" | awk -F: '{print $7}')
    [[ ${shell} == /usr/sbin/nologin || ${shell} == /bin/false ]] \
      || die "existing ${name} account has an interactive shell"
    return
  fi
  useradd --system --user-group --home-dir "${home}" --shell /usr/sbin/nologin "${name}"
}

ensure_accounts_and_directories() {
  ensure_system_user "${api_user}" /nonexistent
  ensure_system_user "${web_user}" /nonexistent
  ensure_system_user "${worker_user}" /nonexistent
  ensure_system_user "${migrate_user}" /nonexistent
  ensure_system_user "${build_user}" /var/lib/npr-build

  install -d -o root -g root -m 0755 "${release_root}" "${releases_dir}"
  install -d -o "${api_user}" -g "${api_user}" -m 0750 "${poster_storage_dir}"
  # The worker needs traversal only to open its own mode-0600 Google credential.
  # It cannot list this directory or read the root-owned environment files.
  install -d -o root -g "${worker_user}" -m 0710 "${config_dir}"
  install -d -o root -g root -m 0755 "${release_root}/.tooling"
  install -d -o "${build_user}" -g "${build_user}" -m 0750 \
    /var/lib/npr-build "${corepack_home}" "${release_root}/.pnpm-store"
}

bootstrap_corepack() {
  if [[ -f ${corepack_entry} ]]; then
    [[ $(/usr/bin/node "${corepack_entry}" --version) == "${corepack_version}" ]] \
      || die "installed release Corepack has an unexpected version"
    return
  fi
  [[ ! -e ${corepack_install_dir} ]] || die "incomplete Corepack installation exists: ${corepack_install_dir}"

  local incoming=${release_root}/.tooling/.incoming-corepack-${corepack_version}-$$
  install -d -o root -g root -m 0755 "${incoming}"
  cleanup_path=${incoming}
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    --output "${incoming}/corepack.tgz" "${corepack_tarball_url}"
  local actual_sha512
  actual_sha512=$(openssl dgst -sha512 -binary "${incoming}/corepack.tgz" | openssl base64 -A)
  [[ ${actual_sha512} == "${corepack_sha512}" ]] || die "Corepack tarball integrity check failed"
  tar -xzf "${incoming}/corepack.tgz" -C "${incoming}"
  [[ $(/usr/bin/node "${incoming}/package/dist/corepack.js" --version) == "${corepack_version}" ]] \
    || die "downloaded Corepack version check failed"
  chown -R root:root "${incoming}/package"
  chmod -R go-w "${incoming}/package"
  mv -- "${incoming}/package" "${corepack_install_dir}"
  rm -f -- "${incoming}/corepack.tgz"
  rmdir "${incoming}"
  cleanup_path=
}

env_key_count() {
  local file=$1
  local wanted=$2
  awk -v wanted="${wanted}" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/^[[:space:]]*/, "", line)
      split(line, pair, "=")
      key=pair[1]
      sub(/[[:space:]]*$/, "", key)
      if (key == wanted) count++
    }
    END { print count+0 }
  ' "${file}"
}

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

require_env_key() {
  local file=$1
  local key=$2
  local count
  count=$(env_key_count "${file}" "${key}")
  [[ ${count} -eq 1 ]] || die "${file} must contain exactly one ${key} entry"
  [[ -n $(env_value "${file}" "${key}") ]] || die "${file} contains an empty ${key} entry"
}

forbid_env_key() {
  local file=$1
  local key=$2
  [[ $(env_key_count "${file}" "${key}") -eq 0 ]] \
    || die "${file} must not contain ${key}"
}

validate_root_environment_file() {
  local file=$1
  [[ -f ${file} && ! -L ${file} ]] || die "missing regular environment file: ${file}"
  [[ $(stat -c '%u:%g:%a' "${file}") == 0:0:600 ]] \
    || die "${file} must be root:root mode 0600"
}

declare -A env_updates=()
declare -a env_update_order=()

queue_env_value() {
  local key=$1
  local value=$2
  [[ ${key} =~ ^[A-Z][A-Z0-9_]*$ ]] || die "invalid environment key"
  if [[ ! -v env_updates[${key}] ]]; then
    env_update_order+=("${key}")
  fi
  env_updates[${key}]=${value}
}

backup_environment_file() {
  local file=$1
  local backup=${file}.bak.${stamp}
  if [[ -e ${backup} ]]; then
    backup=${backup}.$$
  fi
  [[ ! -e ${backup} ]] || die "environment backup path already exists: ${backup}"
  cp -a -- "${file}" "${backup}"
  chown root:root "${backup}"
  chmod 0600 "${backup}"
}

atomic_upsert_environment() {
  local file=$1
  local owner=$2
  local group=$3
  local mode=$4
  local temp
  temp=$(mktemp "${config_dir}/.$(basename "${file}").XXXXXX")
  local -A emitted=()
  local line key
  while IFS= read -r line || [[ -n ${line} ]]; do
    key=
    if [[ ${line} =~ ^[[:space:]]*([A-Z][A-Z0-9_]*)[[:space:]]*= ]]; then
      key=${BASH_REMATCH[1]}
    fi
    if [[ -n ${key} && -v env_updates[${key}] ]]; then
      if [[ ! -v emitted[${key}] ]]; then
        printf '%s=%s\n' "${key}" "${env_updates[${key}]}" >> "${temp}"
        emitted[${key}]=1
      fi
    else
      printf '%s\n' "${line}" >> "${temp}"
    fi
  done < "${file}"
  for key in "${env_update_order[@]}"; do
    if [[ ! -v emitted[${key}] ]]; then
      printf '%s=%s\n' "${key}" "${env_updates[${key}]}" >> "${temp}"
    fi
  done
  chown "${owner}:${group}" "${temp}"
  chmod "${mode}" "${temp}"
  if cmp -s "${temp}" "${file}"; then
    rm -f -- "${temp}"
    chown "${owner}:${group}" "${file}"
    chmod "${mode}" "${file}"
  else
    backup_environment_file "${file}"
    mv -fT -- "${temp}" "${file}"
  fi
  env_updates=()
  env_update_order=()
}

write_environment_exact() {
  local file=$1
  shift
  local temp key value
  [[ ! -e ${file} || ( -f ${file} && ! -L ${file} ) ]] \
    || die "environment path is not a regular file: ${file}"
  temp=$(mktemp "${config_dir}/.$(basename "${file}").XXXXXX")
  for key in "$@"; do
    value=$(env_value "${runtime_env}" "${key}")
    if [[ -n ${value} ]]; then
      printf '%s=%s\n' "${key}" "${value}" >> "${temp}"
    fi
  done
  chown root:root "${temp}"
  chmod 0600 "${temp}"
  if [[ -f ${file} ]] && cmp -s "${temp}" "${file}"; then
    rm -f -- "${temp}"
    chown root:root "${file}"
    chmod 0600 "${file}"
  else
    if [[ -f ${file} ]]; then
      backup_environment_file "${file}"
    fi
    mv -fT -- "${temp}" "${file}"
  fi
}

write_queued_environment_exact() {
  local file=$1
  [[ ! -e ${file} || ( -f ${file} && ! -L ${file} ) ]] \
    || die "environment path is not a regular file: ${file}"
  local temp key
  temp=$(mktemp "${config_dir}/.$(basename "${file}").XXXXXX")
  for key in "${env_update_order[@]}"; do
    printf '%s=%s\n' "${key}" "${env_updates[${key}]}" >> "${temp}"
  done
  chown root:root "${temp}"
  chmod 0600 "${temp}"
  if [[ -f ${file} ]] && cmp -s "${temp}" "${file}"; then
    rm -f -- "${temp}"
    chown root:root "${file}"
    chmod 0600 "${file}"
  else
    if [[ -f ${file} ]]; then
      backup_environment_file "${file}"
    fi
    mv -fT -- "${temp}" "${file}"
  fi
  env_updates=()
  env_update_order=()
}

random_base64_key() {
  openssl rand -base64 32 | tr -d '\n'
}

runtime_or_existing_worker_value() {
  local key=$1
  local value
  value=$(env_value "${runtime_env}" "${key}")
  if [[ -z ${value} && -f ${worker_env} && ! -L ${worker_env} ]]; then
    value=$(env_value "${worker_env}" "${key}")
  fi
  printf '%s' "${value}"
}

install_tong_api_environment() {
  local secret_file mode username password wire temp enabled confirmed
  for secret_file in "${tong_username_file}" "${tong_password_file}"; do
    [[ -f ${secret_file} && ! -L ${secret_file} ]] || die "missing regular Tong credential file"
    mode=$(stat -c '%u:%a' "${secret_file}")
    [[ ${mode} == 0:600 || ${mode} == 0:640 ]] || die "Tong credential files must be root-owned mode 0600 or 0640"
  done
  [[ -f ${tong_wire_contract} && ! -L ${tong_wire_contract} ]] || die "missing production Tong wire contract"
  TONG_WIRE_FILE=${tong_wire_contract} node -e '
    const fs = require("node:fs");
    const raw = fs.readFileSync(process.env.TONG_WIRE_FILE, "utf8");
    if (!raw.endsWith("\n") || raw.slice(0, -1).includes("\n") || raw.includes("\r") || raw.includes("\u0027")) process.exit(1);
    const parsed = JSON.parse(raw);
    if (JSON.stringify(parsed) !== raw.slice(0, -1)) process.exit(1);
  ' || die "production Tong wire contract must be canonical single-line JSON safe for EnvironmentFile"

  username=$(<"${tong_username_file}")
  password=$(<"${tong_password_file}")
  wire=$(<"${tong_wire_contract}")
  enabled=$(env_value "${api_env}" TONG_SYNC_ENABLED)
  confirmed=$(env_value "${api_env}" TONG_WIRE_CONTRACT_CONFIRMED)
  [[ ( ${enabled} == false && ${confirmed} == false ) \
    || ( ${enabled} == true && ${confirmed} == true ) ]] \
    || die "Tong synchronization and wire confirmation must be enabled or disabled together"
  [[ -n ${username} && -n ${password} && ${#username} -le 1000 && ${#password} -le 1000 ]] \
    || die "Tong credential files are empty or oversized"
  [[ ${username} != *$'\n'* && ${username} != *$'\r'* && ${username} != *"'"* \
    && ${password} != *$'\n'* && ${password} != *$'\r'* && ${password} != *"'"* ]] \
    || die "Tong credentials are not safe for the root-owned EnvironmentFile"

  temp=$(mktemp "${config_dir}/.api.env.tong.XXXXXX")
  tong_environment_temp=${temp}
  awk -F= '$1 !~ /^TONG_/' "${api_env}" > "${temp}"
  printf '%s\n' \
    "TONG_SYNC_ENABLED='${enabled}'" \
    "TONG_WIRE_CONTRACT_CONFIRMED='${confirmed}'" \
    "TONG_WIRE_CONTRACT_JSON='${wire}'" \
    "TONG_BASE_URL='${tong_base_url}'" \
    "TONG_USERNAME='${username}'" \
    "TONG_PASSWORD='${password}'" >> "${temp}"
  chown root:root "${temp}"
  chmod 0600 "${temp}"
  mv -fT -- "${temp}" "${api_env}"
  tong_environment_temp=
  unset username password wire
}

build_url() {
  local scheme=$1
  local username=$2
  local password=$3
  local host=$4
  local port=$5
  local path=$6
  local query=${7:-}
  URL_SCHEME=${scheme} URL_USERNAME=${username} URL_PASSWORD=${password} \
    URL_HOST=${host} URL_PORT=${port} URL_PATH=${path} URL_QUERY=${query} \
    node -e '
      const url = new URL(`${process.env.URL_SCHEME}://invalid.local`);
      url.username = process.env.URL_USERNAME;
      url.password = process.env.URL_PASSWORD;
      url.hostname = process.env.URL_HOST;
      url.port = process.env.URL_PORT;
      url.pathname = process.env.URL_PATH;
      url.search = process.env.URL_QUERY;
      process.stdout.write(url.toString());
    '
}

require_runtime_value() {
  local key=$1
  local value
  value=$(env_value "${runtime_env}" "${key}")
  [[ -n ${value} ]] || die "${runtime_env} is missing ${key}; datastore credentials cannot be regenerated by deployment"
  printf '%s' "${value}"
}

migrate_runtime_environment() {
  [[ -f ${runtime_env} && ! -L ${runtime_env} ]] \
    || die "${runtime_env} must be provisioned by install-datastores.sh first"

  local db_host db_port db_name db_migrator_user db_migrator_password
  local db_api_user db_api_password db_worker_user db_worker_password
  local redis_host redis_port redis_user redis_password
  db_host=$(require_runtime_value DB_HOST)
  db_port=$(require_runtime_value DB_PORT)
  db_name=$(require_runtime_value DB_NAME)
  [[ ${db_name} == npr_seminar ]] || die "DB_NAME must be npr_seminar"
  db_migrator_user=$(require_runtime_value DB_MIGRATOR_USERNAME)
  db_migrator_password=$(require_runtime_value DB_MIGRATOR_PASSWORD)
  db_api_user=$(require_runtime_value DB_APP_USERNAME)
  db_api_password=$(require_runtime_value DB_APP_PASSWORD)
  db_worker_user=$(env_value "${runtime_env}" DB_WORKER_USERNAME)
  db_worker_user=${db_worker_user:-npr_worker}
  [[ ${db_worker_user} == npr_worker ]] || die "DB_WORKER_USERNAME must be npr_worker"
  db_worker_password=$(env_value "${runtime_env}" DB_WORKER_PASSWORD)
  [[ -n ${db_worker_password} ]] || db_worker_password=$(openssl rand -hex 32)
  redis_host=$(require_runtime_value REDIS_HOST)
  redis_port=$(require_runtime_value REDIS_PORT)
  redis_user=$(require_runtime_value REDIS_USERNAME)
  redis_password=$(require_runtime_value REDIS_PASSWORD)

  queue_env_value DB_WORKER_USERNAME "${db_worker_user}"
  queue_env_value DB_WORKER_PASSWORD "${db_worker_password}"

  local value
  value=$(build_url postgresql "${db_migrator_user}" "${db_migrator_password}" "${db_host}" "${db_port}" "/${db_name}" '?application_name=npr_migrator')
  queue_env_value MIGRATION_DATABASE_URL "${value}"
  value=$(build_url postgresql "${db_api_user}" "${db_api_password}" "${db_host}" "${db_port}" "/${db_name}" '?application_name=npr_api')
  queue_env_value DATABASE_URL "${value}"
  value=$(build_url postgresql "${db_worker_user}" "${db_worker_password}" "${db_host}" "${db_port}" "/${db_name}" '?application_name=npr_worker')
  queue_env_value WORKER_DATABASE_URL "${value}"
  value=$(build_url redis "${redis_user}" "${redis_password}" "${redis_host}" "${redis_port}" /0)
  queue_env_value REDIS_URL "${value}"

  local key
  for key in SESSION_SECRET PHONE_ENCRYPTION_KEY PHONE_HMAC_KEY OTP_PEPPER SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY; do
    value=$(env_value "${runtime_env}" "${key}")
    [[ -n ${value} ]] || value=$(random_base64_key)
    queue_env_value "${key}" "${value}"
  done

  for key in ALIGO_IDENTIFIER ALIGO_KEY SMS_TEST_RECIPIENTS SMS_SENDER_SONGPA SMS_SENDER_WIRYE \
      SMS_SENDER_GWANGJIN GOOGLE_APPLICATION_CREDENTIALS; do
    value=$(runtime_or_existing_worker_value "${key}")
    [[ -z ${value} ]] || queue_env_value "${key}" "${value}"
  done

  local -a defaults=(
    'APP_ENV=production'
    'PORT=4000'
    'TRUST_PROXY=1'
    "PUBLIC_BASE_URL=${default_public_base_url}"
    "POSTER_STORAGE_DIR=${poster_storage_dir}"
    'SMS_ENABLED=false'
    'SMS_RECIPIENT_ALLOWLIST_ENABLED=true'
    'SMS_ALIGO_TEST_MODE=true'
    'GOOGLE_SHEETS_ENABLED=false'
    'GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT=false'
    'GOOGLE_SHEETS_SPREADSHEET_ID=1hOYWwKHpk_tchht6MVQ1dEwoW9iT7qJbzQRlLXUKpP0'
    # Explicit opt-in: first install is disabled. Once the host-gated control
    # command enables both flags, their runtime values survive later deploys.
    'TONG_SYNC_ENABLED=false'
    'TONG_WIRE_CONTRACT_CONFIRMED=false'
  )
  local item default_value
  for item in "${defaults[@]}"; do
    key=${item%%=*}
    default_value=${item#*=}
    value=$(env_value "${runtime_env}" "${key}")
    queue_env_value "${key}" "${value:-${default_value}}"
  done
  atomic_upsert_environment "${runtime_env}" root root 0600

  write_environment_exact "${api_env}" \
    DATABASE_URL REDIS_URL SESSION_SECRET PHONE_ENCRYPTION_KEY PHONE_HMAC_KEY OTP_PEPPER \
    SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY PUBLIC_BASE_URL POSTER_STORAGE_DIR TRUST_PROXY SMS_ENABLED \
    SMS_RECIPIENT_ALLOWLIST_ENABLED SMS_TEST_RECIPIENTS SMS_ALIGO_TEST_MODE GOOGLE_SHEETS_ENABLED \
    GOOGLE_SHEETS_SPREADSHEET_ID TONG_SYNC_ENABLED TONG_WIRE_CONTRACT_CONFIRMED
  install_tong_api_environment
  write_environment_exact "${worker_env}" \
    WORKER_DATABASE_URL PHONE_ENCRYPTION_KEY PUBLIC_BASE_URL SMS_ENABLED \
    SMS_RECIPIENT_ALLOWLIST_ENABLED SMS_TEST_RECIPIENTS SMS_SENDER_SONGPA SMS_SENDER_WIRYE \
    SMS_SENDER_GWANGJIN SMS_ALIGO_TEST_MODE ALIGO_IDENTIFIER ALIGO_KEY GOOGLE_SHEETS_ENABLED \
    GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT GOOGLE_SHEETS_SPREADSHEET_ID \
    GOOGLE_APPLICATION_CREDENTIALS
  queue_env_value NEST_API_ORIGIN "${nest_origin}"
  write_queued_environment_exact "${web_env}"
  queue_env_value MIGRATION_DATABASE_URL "$(env_value "${runtime_env}" MIGRATION_DATABASE_URL)"
  write_queued_environment_exact "${migration_env}"
  log "runtime environment schema reconciled without exposing values"
}

validate_environment_boundaries() {
  local file key tong_enabled tong_confirmed
  for file in "${api_env}" "${worker_env}" "${web_env}" "${migration_env}"; do
    validate_root_environment_file "${file}"
  done

  for key in DATABASE_URL REDIS_URL SESSION_SECRET PHONE_ENCRYPTION_KEY PHONE_HMAC_KEY \
      OTP_PEPPER SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY PUBLIC_BASE_URL POSTER_STORAGE_DIR SMS_ENABLED \
      SMS_RECIPIENT_ALLOWLIST_ENABLED SMS_ALIGO_TEST_MODE TONG_SYNC_ENABLED \
      TONG_WIRE_CONTRACT_CONFIRMED TONG_WIRE_CONTRACT_JSON TONG_BASE_URL TONG_USERNAME TONG_PASSWORD; do
    require_env_key "${api_env}" "${key}"
  done
  API_ENV_PATH=${api_env} node -e '
    const fs = require("node:fs");
    const values = Object.fromEntries(fs.readFileSync(process.env.API_ENV_PATH, "utf8")
      .split(/\n/u).filter(Boolean).map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }));
    const names = ["SESSION_SECRET", "PHONE_ENCRYPTION_KEY", "PHONE_HMAC_KEY", "OTP_PEPPER", "SCANNER_PAIRING_HMAC_KEY", "QR_ENCRYPTION_KEY"];
    const secrets = names.map((name) => values[name]);
    if (secrets.some((value) => typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value))) process.exit(1);
    if (secrets.some((value) => Buffer.from(value, "base64").length !== 32 || Buffer.from(value, "base64").toString("base64") !== value)) process.exit(1);
    if (new Set(secrets).size !== secrets.length) process.exit(1);
  ' || die "API cryptographic keys must be independent canonical base64 encodings of 32 bytes"
  tong_enabled=$(env_value "${api_env}" TONG_SYNC_ENABLED)
  tong_confirmed=$(env_value "${api_env}" TONG_WIRE_CONTRACT_CONFIRMED)
  [[ ( ${tong_enabled} == false && ${tong_confirmed} == false ) \
    || ( ${tong_enabled} == true && ${tong_confirmed} == true ) ]] \
    || die "Tong synchronization and wire confirmation must be enabled or disabled together"
  [[ ${tong_enabled} == "$(env_value "${runtime_env}" TONG_SYNC_ENABLED)" \
    && ${tong_confirmed} == "$(env_value "${runtime_env}" TONG_WIRE_CONTRACT_CONFIRMED)" ]] \
    || die "API Tong state must match the persistent runtime state"
  [[ $(env_value "${api_env}" TONG_BASE_URL) == "${tong_base_url}" \
    && $(env_value "${api_env}" TONG_WIRE_CONTRACT_JSON) == "$(<"${tong_wire_contract}")" ]] \
    || die "API Tong origin or wire contract differs from the production capture contract"
  [[ $(env_value "${api_env}" TRUST_PROXY) == 1 ]] \
    || die "${api_env} must set TRUST_PROXY=1 behind the GCP Caddy/WireGuard ingress and Next"
  [[ $(env_value "${api_env}" POSTER_STORAGE_DIR) == "${poster_storage_dir}" ]] \
    || die "${api_env} must use persistent poster storage at ${poster_storage_dir}"
  [[ -d ${poster_storage_dir} && ! -L ${poster_storage_dir} ]] \
    || die "poster storage must be a real directory outside the release symlink"
  [[ $(readlink -f -- "${poster_storage_dir}") == "${poster_storage_dir}" ]] \
    || die "poster storage path must not traverse a symlink"
  [[ $(stat -c '%u:%g:%a' "${poster_storage_dir}") == "$(id -u "${api_user}"):$(id -g "${api_user}"):750" ]] \
    || die "poster storage must be owned by ${api_user}:${api_user} with mode 0750"
  for key in GOOGLE_APPLICATION_CREDENTIALS WORKER_DATABASE_URL MIGRATION_DATABASE_URL \
      ALIGO_IDENTIFIER ALIGO_KEY SMS_SENDER_SONGPA SMS_SENDER_WIRYE \
      SMS_SENDER_GWANGJIN GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT; do
    forbid_env_key "${api_env}" "${key}"
  done

  for key in WORKER_DATABASE_URL PHONE_ENCRYPTION_KEY PUBLIC_BASE_URL SMS_ENABLED \
      SMS_RECIPIENT_ALLOWLIST_ENABLED SMS_ALIGO_TEST_MODE GOOGLE_SHEETS_ENABLED \
      GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT; do
    require_env_key "${worker_env}" "${key}"
  done
  for key in DATABASE_URL MIGRATION_DATABASE_URL REDIS_URL SESSION_SECRET OTP_PEPPER SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY \
      POSTER_STORAGE_DIR TONG_SYNC_ENABLED TONG_WIRE_CONTRACT_CONFIRMED TONG_WIRE_CONTRACT_JSON TONG_BASE_URL TONG_USERNAME TONG_PASSWORD; do
    forbid_env_key "${worker_env}" "${key}"
  done
  [[ $(env_value "${api_env}" SMS_ENABLED) == "$(env_value "${worker_env}" SMS_ENABLED)" ]] \
    || die "API and worker SMS_ENABLED must derive from the same runtime value"
  [[ $(env_value "${api_env}" SMS_RECIPIENT_ALLOWLIST_ENABLED) == "$(env_value "${worker_env}" SMS_RECIPIENT_ALLOWLIST_ENABLED)" ]] \
    || die "API and worker SMS allowlist state must derive from the same runtime value"
  [[ $(env_value "${api_env}" SMS_TEST_RECIPIENTS) == "$(env_value "${worker_env}" SMS_TEST_RECIPIENTS)" ]] \
    || die "API and worker SMS recipient allowlist must derive from the same runtime value"

  require_env_key "${web_env}" NEST_API_ORIGIN
  [[ $(env_value "${web_env}" NEST_API_ORIGIN) == "${nest_origin}" ]] \
    || die "${web_env} must target ${nest_origin}"
  for key in DATABASE_URL WORKER_DATABASE_URL MIGRATION_DATABASE_URL REDIS_URL SESSION_SECRET \
      PHONE_ENCRYPTION_KEY PHONE_HMAC_KEY OTP_PEPPER SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY \
      GOOGLE_APPLICATION_CREDENTIALS ALIGO_IDENTIFIER ALIGO_KEY POSTER_STORAGE_DIR \
      TONG_SYNC_ENABLED TONG_WIRE_CONTRACT_CONFIRMED TONG_WIRE_CONTRACT_JSON TONG_BASE_URL TONG_USERNAME TONG_PASSWORD; do
    forbid_env_key "${web_env}" "${key}"
  done
  require_env_key "${migration_env}" MIGRATION_DATABASE_URL
  for key in POSTER_STORAGE_DIR TONG_SYNC_ENABLED TONG_WIRE_CONTRACT_CONFIRMED TONG_WIRE_CONTRACT_JSON \
      TONG_BASE_URL TONG_USERNAME TONG_PASSWORD; do
    forbid_env_key "${migration_env}" "${key}"
  done

  if [[ $(env_value "${worker_env}" SMS_ENABLED) == true ]]; then
    for key in ALIGO_IDENTIFIER ALIGO_KEY SMS_SENDER_SONGPA SMS_SENDER_WIRYE SMS_SENDER_GWANGJIN; do
      require_env_key "${worker_env}" "${key}"
    done
  fi
  if [[ $(env_value "${worker_env}" GOOGLE_SHEETS_ENABLED) == true ]]; then
    require_env_key "${worker_env}" GOOGLE_SHEETS_SPREADSHEET_ID
    require_env_key "${worker_env}" GOOGLE_APPLICATION_CREDENTIALS
    local credential_path
    credential_path=$(env_value "${worker_env}" GOOGLE_APPLICATION_CREDENTIALS)
    [[ ${credential_path} == "${config_dir}/google-service-account.json" ]] \
      || die "Google credential path must be ${config_dir}/google-service-account.json"
    [[ -f ${credential_path} && ! -L ${credential_path} ]] \
      || die "Google credential must be a regular non-symlink file"
    [[ $(stat -c '%u:%a' "${credential_path}") == "$(id -u "${worker_user}"):600" ]] \
      || die "Google credential must be owned by ${worker_user} with mode 0600"
  fi
}

validate_source_tree() {
  [[ -d ${source_dir} ]] || die "source directory does not exist: ${source_dir}"
  source_dir=$(readlink -f -- "${source_dir}")
  local required
  for required in package.json pnpm-lock.yaml pnpm-workspace.yaml apps/api/package.json \
      apps/web/package.json apps/web/next.config.ts; do
    [[ -f ${source_dir}/${required} ]] || die "source is missing ${required}"
  done
  PACKAGE_JSON="${source_dir}/package.json" EXPECTED_PNPM="pnpm@${expected_pnpm_version}" node -e '
    const pkg = require(process.env.PACKAGE_JSON);
    if (pkg.packageManager !== process.env.EXPECTED_PNPM) process.exit(1);
  ' || die "root packageManager must stay pinned to pnpm@${expected_pnpm_version}"
  [[ ${stamp} =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "invalid release stamp: ${stamp}"
}

validate_units() {
  local unit
  local -a unit_paths=()
  for unit in "${deployment_units[@]}"; do
    [[ -f ${unit_source_dir}/${unit} ]] || die "missing systemd unit: ${unit_source_dir}/${unit}"
    unit_paths+=("${unit_source_dir}/${unit}")
  done
  systemd-analyze verify "${unit_paths[@]}" >/dev/null
}

install_units() {
  local unit
  for unit in "${deployment_units[@]}"; do
    install -o root -g root -m 0644 "${unit_source_dir}/${unit}" "/etc/systemd/system/${unit}"
  done
  systemctl daemon-reload
  systemctl enable "${deployment_units[@]}" >/dev/null
}

copy_source_tree() {
  local incoming=$1
  install -d -o "${build_user}" -g "${build_user}" -m 0755 "${incoming}"
  tar \
    --exclude='./.git' \
    --exclude='./node_modules' --exclude='*/node_modules' \
    --exclude='./.turbo' --exclude='*/.turbo' \
    --exclude='*/.next' --exclude='*/dist' \
    --exclude='*/.env' --exclude='*/.env.*' \
    -C "${source_dir}" -cf - . \
    | tar -C "${incoming}" -xf -
  chown -R "${build_user}:${build_user}" "${incoming}"
}

build_release() {
  local incoming=$1
  (
    cd -- "${incoming}"
    local pnpm_version
    pnpm_version=$(runuser -u "${build_user}" -- env \
      COREPACK_HOME="${corepack_home}" \
      XDG_CACHE_HOME=/var/lib/npr-build/cache \
      /usr/bin/node "${corepack_entry}" pnpm --version)
    [[ ${pnpm_version} == "${expected_pnpm_version}" ]] \
      || die "Corepack resolved pnpm ${pnpm_version}, expected ${expected_pnpm_version}"
    runuser -u "${build_user}" -- env \
      COREPACK_HOME="${corepack_home}" \
      XDG_CACHE_HOME=/var/lib/npr-build/cache \
      /usr/bin/node "${corepack_entry}" pnpm install --frozen-lockfile --store-dir "${release_root}/.pnpm-store"
    runuser -u "${build_user}" -- env \
      COREPACK_HOME="${corepack_home}" \
      XDG_CACHE_HOME=/var/lib/npr-build/cache \
      /usr/bin/node "${corepack_entry}" pnpm --filter @npr-seminar/api build
    runuser -u "${build_user}" -- env \
      COREPACK_HOME="${corepack_home}" \
      XDG_CACHE_HOME=/var/lib/npr-build/cache \
      NODE_ENV=production NEST_API_ORIGIN="${nest_origin}" \
      /usr/bin/node "${corepack_entry}" pnpm --filter @npr-seminar/web build
  )
}

preflight_release() {
  local release=$1
  local required
  for required in \
      apps/api/dist/main.js \
      apps/api/dist/worker.js \
      apps/api/dist/modules/google-sheets/sheet-mapping-control.command.js \
      apps/api/node_modules/.bin/prisma \
      apps/api/prisma.config.ts \
      apps/api/prisma/migrations \
      ops/pve-release/google-sheets-control.sh \
      ops/pve-release/google-sheets-reset-development-data.sh \
      ops/pve-release/google-sheets-reset-development-data.mjs \
      ops/pve-release/reset-development-bookings.sh \
      ops/pve-release/bootstrap-admin.sh \
      ops/pve-release/tong-sync-control.sh \
      ops/pve-release/tong-wire-contract.production.json \
      apps/web/.next/BUILD_ID \
      apps/web/.next/required-server-files.json \
      apps/web/.next/routes-manifest.json \
      apps/web/node_modules/next/dist/bin/next; do
    [[ -e ${release}/${required} ]] || die "release artifact is missing: ${required}"
  done
  [[ -x ${release}/ops/pve-release/google-sheets-control.sh ]] \
    || die "Google Sheets control wrapper is not executable"
  [[ -x ${release}/ops/pve-release/google-sheets-reset-development-data.sh ]] \
    || die "Google Sheets development reset wrapper is not executable"
  [[ -x ${release}/ops/pve-release/reset-development-bookings.sh ]] \
    || die "development booking reset wrapper is not executable"
  [[ -x ${release}/ops/pve-release/bootstrap-admin.sh ]] \
    || die "administrator bootstrap wrapper is not executable"
  [[ -x ${release}/ops/pve-release/tong-sync-control.sh ]] \
    || die "Tong sync control wrapper is not executable"
  RELEASE_MANIFEST="${release}/apps/web/.next/routes-manifest.json" \
    NEST_ORIGIN="${nest_origin}" node -e '
      const fs = require("node:fs");
      const manifest = JSON.parse(fs.readFileSync(process.env.RELEASE_MANIFEST, "utf8"));
      const rewrites = Object.values(manifest.rewrites ?? {}).flat();
      const expected = `${process.env.NEST_ORIGIN}/api/v1/:path*`;
      if (!rewrites.some((entry) => entry.source === "/api/v1/:path*" && entry.destination === expected)) {
        process.exit(1);
      }
    ' || die "Next build does not contain the same-origin Nest API rewrite"
}

verify_runtime_release_access() {
  local release=$1
  runuser -u "${api_user}" -- test -r "${release}/apps/api/dist/main.js" \
    || die "${api_user} cannot read the finalized API release"
  runuser -u "${worker_user}" -- test -r "${release}/apps/api/dist/worker.js" \
    || die "${worker_user} cannot read the finalized worker release"
  runuser -u "${web_user}" -- test -r "${release}/apps/web/node_modules/next/dist/bin/next" \
    || die "${web_user} cannot read the finalized web release"
  runuser -u "${migrate_user}" -- test -x "${release}/apps/api/node_modules/.bin/prisma" \
    || die "${migrate_user} cannot execute the finalized Prisma CLI"
}

finalize_release() {
  local incoming=$1
  local release=$2
  [[ ! -e ${release} ]] || die "release already exists: ${release}"
  chown -R root:root "${incoming}"
  # tar preserves the developer checkout's directory modes. Some workspaces use
  # 0700 for source directories, which would make the finalized release
  # unreadable to the isolated API/web/worker/migration users. The staged tree
  # contains no runtime environment files or credentials, so normalize read and
  # traversal access while keeping every path immutable to non-root users.
  chmod -R a+rX,go-w "${incoming}"
  [[ ! -L ${incoming}/apps/web/.next/cache ]] || die "Next cache path must not be a symlink"
  install -d -o "${web_user}" -g "${web_user}" -m 0750 "${incoming}/apps/web/.next/cache"
  chown -R "${web_user}:${web_user}" "${incoming}/apps/web/.next/cache"
  mv -- "${incoming}" "${release}"
  cleanup_path=
  preflight_release "${release}"
  verify_runtime_release_access "${release}"
}

verify_authenticated_redis() {
  local release=$1
  local redis_url
  redis_url=$(env_value "${api_env}" REDIS_URL)
  (
    cd -- "${release}/apps/api"
    runuser -u "${api_user}" -- env REDIS_URL="${redis_url}" \
      timeout 12s /usr/bin/node -e '
        const { createClient } = require("redis");
        const client = createClient({
          url: process.env.REDIS_URL,
          socket: { connectTimeout: 5000, reconnectStrategy: false },
        });
        client.on("error", () => {});
        (async () => {
          await client.connect();
          const reply = await client.ping();
          const probeKey = `npr:acl-preflight:${process.pid}:${Date.now()}`;
          const evalReply = await client.eval(
            "redis.call(\"SET\",KEYS[1],ARGV[1],\"EX\",\"30\"); local value=redis.call(\"GET\",KEYS[1]); redis.call(\"DEL\",KEYS[1]); return value",
            { keys: [probeKey], arguments: ["verified"] },
          );
          await client.quit();
          if (reply !== "PONG" || evalReply !== "verified") process.exit(2);
        })().catch(async () => {
          try { if (client.isOpen) await client.disconnect(); } catch {}
          process.exit(1);
        });
      '
  ) >/dev/null 2>&1 || die "authenticated Redis preflight failed"
}

verify_authenticated_postgres_utc() {
  local release=$1
  local database_url
  database_url=$(env_value "${api_env}" DATABASE_URL)
  (
    cd -- "${release}/apps/api"
    runuser -u "${api_user}" -- env DATABASE_URL="${database_url}" \
      timeout 12s /usr/bin/node -e '
        const { Client } = require("pg");
        const client = new Client({
          connectionString: process.env.DATABASE_URL,
          connectionTimeoutMillis: 5000,
        });
        (async () => {
          await client.connect();
          const result = await client.query("select current_setting(\x27TimeZone\x27) as timezone");
          await client.end();
          if (result.rows[0]?.timezone !== "UTC") process.exit(2);
        })().catch(async () => {
          try { await client.end(); } catch {}
          process.exit(1);
        });
      '
  ) >/dev/null 2>&1 || die "authenticated PostgreSQL UTC preflight failed"
}

backup_postgresql() {
  systemctl cat npr-postgres-backup.service >/dev/null \
    || die "npr-postgres-backup.service must be installed before database changes"
  log "creating a pre-change PostgreSQL backup"
  systemctl start npr-postgres-backup.service
  [[ $(systemctl show npr-postgres-backup.service -p Result --value) == success ]] \
    || die "pre-change PostgreSQL backup failed"
}

ensure_worker_database_role() {
  local password escaped_password
  password=$(env_value "${runtime_env}" DB_WORKER_PASSWORD)
  [[ -n ${password} && ${password} != *$'\n'* && ${password} != *$'\r'* ]] \
    || die "DB_WORKER_PASSWORD is invalid"
  escaped_password=${password//\'/\'\'}
  log "ensuring the isolated npr_worker login role exists"
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 postgres >/dev/null <<SQL
DO \$role\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npr_worker') THEN
    CREATE ROLE npr_worker LOGIN;
  END IF;
END
\$role\$;
ALTER ROLE npr_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 8 PASSWORD '${escaped_password}';
ALTER ROLE npr_worker SET timezone = 'UTC';
DO \$membership\$
DECLARE inherited_role record;
BEGIN
  FOR inherited_role IN
    SELECT parent.rolname
      FROM pg_auth_members membership
      JOIN pg_roles parent ON parent.oid = membership.roleid
      JOIN pg_roles member ON member.oid = membership.member
     WHERE member.rolname = 'npr_worker'
  LOOP
    EXECUTE format('REVOKE %I FROM npr_worker', inherited_role.rolname);
  END LOOP;
END
\$membership\$;
REVOKE ALL PRIVILEGES ON DATABASE npr_seminar FROM npr_worker;
GRANT CONNECT ON DATABASE npr_seminar TO npr_worker;
SQL
}

apply_worker_database_grants() {
  log "applying the exact npr_worker table and sequence grants"
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 npr_seminar >/dev/null <<'SQL'
REVOKE ALL ON SCHEMA public FROM npr_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM npr_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM npr_worker;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM npr_worker;
GRANT USAGE ON SCHEMA public TO npr_worker;
GRANT SELECT ON family_bookings, family_booking_students, students, student_class_assignments, booking_events, seminar_sessions TO npr_worker;
GRANT SELECT, UPDATE ON sms_outbox, sheet_mappings, sheet_outbox TO npr_worker;
GRANT SELECT, INSERT ON sms_attempts, sheet_attempts TO npr_worker;
GRANT USAGE, SELECT ON SEQUENCE sms_attempts_id_seq, sheet_attempts_id_seq TO npr_worker;
SQL
}

verify_recoverable_active_qr() {
  runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 npr_seminar >/dev/null <<'SQL'
do $$
declare
  unrecoverable_count bigint;
begin
  if to_regclass('public.qr_credentials') is null
     or to_regclass('public.family_bookings') is null then
    return;
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='qr_credentials' and column_name='token_ciphertext'
  ) then
    execute $query$
      select count(*)
        from qr_credentials q join family_bookings fb on fb.id=q.family_booking_id
       where q.status='ACTIVE' and fb.status in ('RESERVED','CHECKED_IN') and q.token_ciphertext is null
    $query$ into unrecoverable_count;
  else
    select count(*) into unrecoverable_count
      from qr_credentials q join family_bookings fb on fb.id=q.family_booking_id
     where q.status='ACTIVE' and fb.status in ('RESERVED','CHECKED_IN');
  end if;
  if unrecoverable_count > 0 then
    raise exception 'ACTIVE_QR_CIPHERTEXT_REQUIRED: % active credential(s) are not recoverable', unrecoverable_count;
  end if;
end;
$$;
SQL
}

prepare_database_for_release() {
  local release=$1
  verify_recoverable_active_qr
  backup_postgresql
  ensure_worker_database_role

  if ${run_migrations}; then
    local migration_url
    migration_url=$(env_value "${migration_env}" MIGRATION_DATABASE_URL)
    log "applying forward-only Prisma migrations"
    (
      cd -- "${release}/apps/api"
      runuser -u "${migrate_user}" -- env -i \
        HOME=/nonexistent PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
        NODE_ENV=production \
        MIGRATION_DATABASE_URL="${migration_url}" \
        "${release}/apps/api/node_modules/.bin/prisma" migrate deploy
    )
  else
    log "database migration explicitly skipped; only use this for a schema-compatible code release"
  fi
  verify_recoverable_active_qr
  apply_worker_database_grants
}

atomic_symlink() {
  local target=$1
  local link=$2
  local temp=${link}.new.$$
  [[ ${link} == "${current_link}" || ${link} == "${previous_link}" ]] \
    || die "refusing to replace unexpected symlink: ${link}"
  ln -s -- "${target}" "${temp}"
  mv -fT -- "${temp}" "${link}"
}

resolved_release_link() {
  local link=$1
  [[ -L ${link} ]] || return 0
  local target
  target=$(readlink -f -- "${link}")
  case ${target} in
    "${releases_dir}"/*) printf '%s' "${target}" ;;
    *) die "${link} points outside ${releases_dir}" ;;
  esac
}

activate_release() {
  local target=$1
  local old_target
  old_target=$(resolved_release_link "${current_link}")
  if [[ -n ${old_target} && ${old_target} != "${target}" ]]; then
    atomic_symlink "${old_target}" "${previous_link}"
  fi
  atomic_symlink "${target}" "${current_link}"
  printf '%s' "${old_target}"
}

write_web_deferred_marker() {
  local target=$1
  local temp=${web_deferred_marker}.new.$$
  case ${target} in
    "${releases_dir}"/*) ;;
    *) return 1 ;;
  esac
  (umask 077; printf '%s\n' "${target}" > "${temp}") || return 1
  chown root:root "${temp}" || { rm -f -- "${temp}"; return 1; }
  chmod 0600 "${temp}" || { rm -f -- "${temp}"; return 1; }
  mv -fT -- "${temp}" "${web_deferred_marker}"
}

deferred_release() {
  [[ -f ${web_deferred_marker} && ! -L ${web_deferred_marker} ]] || return 1
  [[ $(stat -c '%U:%G:%a' "${web_deferred_marker}") == root:root:600 ]] || return 1
  local target
  IFS= read -r target < "${web_deferred_marker}" || return 1
  case ${target} in
    "${releases_dir}"/*) printf '%s' "${target}" ;;
    *) return 1 ;;
  esac
}

wait_http() {
  local url=$1
  local attempts=${2:-30}
  local attempt
  for ((attempt=1; attempt<=attempts; attempt++)); do
    if curl --fail --silent --show-error --max-time 3 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

verify_loopback_ports() {
  local listeners
  listeners=$(ss -H -ltn)
  local port addresses address
  for port in "$@"; do
    addresses=$(awk -v suffix=":${port}" '$4 ~ suffix "$" { print $4 }' <<< "${listeners}")
    [[ -n ${addresses} ]] || return 1
    while IFS= read -r address; do
      [[ ${address} == 127.0.0.1:${port} || ${address} == '[::1]':${port} ]] || return 1
    done <<< "${addresses}"
  done
}

verify_exact_listener() {
  local expected=$1
  local port=${expected##*:}
  local listeners addresses address
  listeners=$(ss -H -ltn)
  addresses=$(awk -v suffix=":${port}" '$4 ~ suffix "$" { print $4 }' <<< "${listeners}")
  [[ -n ${addresses} ]] || return 1
  grep -Fxq -- "${expected}" <<< "${addresses}" || return 1
  while IFS= read -r address; do
    [[ ${address} == "${expected}" ]] || return 1
  done <<< "${addresses}"
}

verify_listener_boundaries() {
  verify_loopback_ports 3000 4000 5432 6379 \
    && verify_exact_listener "${caddy_upstream_listener}"
}

verify_deferred_listener_boundaries() {
  local listeners
  listeners=$(ss -H -ltn)
  if awk '$4 ~ /:(3000|3001)$/ { found=1 } END { exit(found ? 0 : 1) }' <<< "${listeners}"; then
    return 1
  fi
  verify_loopback_ports 4000 5432 6379
}

validate_public_base_url() {
  local file configured_url
  for file in "${runtime_env}" "${api_env}" "${worker_env}"; do
    configured_url=$(env_value "${file}" PUBLIC_BASE_URL)
    [[ ${configured_url} == "${default_public_base_url}" ]] \
      || die "${file} must set PUBLIC_BASE_URL exactly to ${default_public_base_url}"
  done
}

start_and_verify_caddy_upstream() {
  # Stop the proxy before rebinding its socket so an old inherited listening
  # descriptor cannot keep the address occupied across a unit update.
  systemctl stop "${caddy_upstream_service}" || return 1
  systemctl restart "${caddy_upstream_socket}" || return 1
  systemctl start "${caddy_upstream_service}" || return 1
  systemctl is-active --quiet "${caddy_upstream_socket}" \
    && systemctl is-active --quiet "${caddy_upstream_service}"
}

verify_public_https() {
  wait_http "${default_public_base_url}/" 15 || return 1
  wait_http "${default_public_base_url}/api/v1/public/seminar-sessions" 15 || return 1
  log "public GCP Caddy URL is ${default_public_base_url}"
}

revalidate_sheets_v4_for_web() {
  local spreadsheet_id
  [[ $(env_value "${worker_env}" GOOGLE_SHEETS_ENABLED) == true ]] \
    || { printf '[npr-deploy] Sheets must be enabled before web activation\n' >&2; return 1; }
  spreadsheet_id=$(env_value "${worker_env}" GOOGLE_SHEETS_SPREADSHEET_ID)
  [[ ${spreadsheet_id} =~ ^[A-Za-z0-9_-]{20,160}$ ]] || return 1

  local mapping_ids
  mapping_ids=$(runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    npr_seminar -c 'select public_id::text from sheet_mappings order by id') || return 1
  [[ -n ${mapping_ids} ]] \
    || { printf '[npr-deploy] no Sheet mapping exists for v4 activation\n' >&2; return 1; }

  local mapping_id
  while IFS= read -r mapping_id; do
    [[ ${mapping_id} =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]] \
      || return 1
    NPR_DEPLOY_LOCK_HELD=true "${current_link}/ops/pve-release/google-sheets-control.sh" \
      enable "${mapping_id}" "${spreadsheet_id}" || return 1
  done <<< "${mapping_ids}"

  local readiness
  readiness=$(runuser -u postgres -- psql -X --set=ON_ERROR_STOP=1 --tuples-only --no-align \
    --set=spreadsheet_id="${spreadsheet_id}" \
    --set=fingerprint="${sheets_v4_fingerprint}" \
    npr_seminar <<'SQL'
select case when count(*) > 0
  and bool_and(spreadsheet_id=:'spreadsheet_id')
  and bool_and(schema_version=4)
  and bool_and(schema_fingerprint=:'fingerprint')
  and bool_and(reservation_sheet_title='예약명단')
  and bool_and(reservation_sheet_id=1777564107)
  and bool_and(enabled)
  and bool_and(circuit_status='CLOSED')
  and bool_and(block_reason_code is null)
  and bool_and(last_validated_at is not null)
then 'ok' else 'failed' end
from sheet_mappings;
SQL
  ) || return 1
  [[ ${readiness} == ok ]] || return 1
  systemctl is-active --quiet npr-seminar-worker.service
}

start_and_verify_api_worker() {
  systemctl restart npr-seminar-api.service
  wait_http http://127.0.0.1:4000/health/ready 30 || return 1
  systemctl restart npr-seminar-worker.service
  sleep 1
  systemctl is-active --quiet npr-seminar-worker.service || return 1
}

start_and_verify_web() {
  systemctl restart npr-seminar-web.service
  wait_http http://127.0.0.1:3000/ 45 || return 1
  wait_http http://127.0.0.1:3000/api/v1/public/seminar-sessions 30 || return 1
}

start_and_verify_services() {
  # Normal deployments retain the existing one-shot behavior. Deferred
  # deployments call the two halves separately around the Sheets v4 gate.
  start_and_verify_api_worker \
    && start_and_verify_web \
    && systemctl is-active --quiet npr-seminar-api.service \
    && systemctl is-active --quiet npr-seminar-web.service \
    && systemctl is-active --quiet npr-seminar-worker.service \
    && start_and_verify_caddy_upstream \
    && verify_listener_boundaries \
    && verify_public_https
}

start_and_verify_deferred_services() {
  systemctl stop "${caddy_upstream_service}" "${caddy_upstream_socket}" \
    npr-seminar-web.service || return 1
  systemctl is-active --quiet npr-seminar-web.service && return 1
  systemctl is-active --quiet "${caddy_upstream_service}" && return 1
  systemctl is-active --quiet "${caddy_upstream_socket}" && return 1
  start_and_verify_api_worker \
    && systemctl is-active --quiet npr-seminar-api.service \
    && systemctl is-active --quiet npr-seminar-worker.service \
    && verify_deferred_listener_boundaries
}

recover_failed_activation() {
  local old_target=$1
  if [[ -n ${old_target} ]]; then
    log "readiness failed; restoring previous code release"
    atomic_symlink "${old_target}" "${current_link}"
    if ! start_and_verify_services; then
      printf '[npr-deploy] CRITICAL: previous release did not recover cleanly\n' >&2
    fi
  else
    log "initial readiness failed; stopping services and removing the current link"
    systemctl stop "${deployment_units[@]}" || true
    if [[ -L ${current_link} ]]; then
      rm -f -- "${current_link}"
    fi
  fi
}

recover_failed_deferred_activation() {
  local old_target=$1
  log "deferred activation failed; leaving every application service stopped"
  systemctl stop "${deployment_units[@]}" || true
  rm -f -- "${web_deferred_marker}"
  if [[ -n ${old_target} ]]; then
    atomic_symlink "${old_target}" "${current_link}"
    log "current code link was restored to the previous release without starting it"
  elif [[ -L ${current_link} ]]; then
    rm -f -- "${current_link}"
  fi
}

deploy_release() {
  [[ ! -e ${web_deferred_marker} ]] \
    || die "a deferred web activation is already pending; run activate-web or rollback first"
  validate_source_tree
  validate_units
  bootstrap_corepack
  migrate_runtime_environment
  validate_environment_boundaries
  validate_public_base_url

  local release=${releases_dir}/${stamp}
  local incoming=${releases_dir}/.incoming-${stamp}
  [[ ! -e ${release} && ! -e ${incoming} ]] || die "release stamp already exists: ${stamp}"
  cleanup_path=${incoming}
  log "building release ${stamp}"
  copy_source_tree "${incoming}"
  build_release "${incoming}"
  preflight_release "${incoming}"
  finalize_release "${incoming}" "${release}"
  verify_authenticated_redis "${release}"
  verify_authenticated_postgres_utc "${release}"
  install_units
  prepare_database_for_release "${release}"

  local old_target
  old_target=$(activate_release "${release}")
  if ${defer_web}; then
    # Persist the exact handoff before starting either runtime. If the shell is
    # interrupted while services start, web activation remains fail-closed and
    # can only resume against this exact current release.
    if ! write_web_deferred_marker "${release}"; then
      recover_failed_deferred_activation "${old_target}"
      die "release ${stamp} could not record deferred web activation"
    fi
    if ! start_and_verify_deferred_services; then
      recover_failed_deferred_activation "${old_target}"
      die "release ${stamp} failed deferred API/worker readiness checks"
    fi
    log "release ${stamp} API/worker are active; web remains stopped pending Sheets v4 and activate-web"
  else
    if ! start_and_verify_services; then
      recover_failed_activation "${old_target}"
      die "release ${stamp} failed readiness checks"
    fi
    log "release ${stamp} is active"
  fi
}

activate_deferred_web() {
  validate_units
  validate_environment_boundaries
  validate_public_base_url

  local current deferred
  current=$(resolved_release_link "${current_link}")
  [[ -n ${current} ]] || die "no current release is active"
  deferred=$(deferred_release) || die "no valid deferred web activation marker exists"
  [[ ${deferred} == "${current}" ]] || die "deferred marker does not match the current release"
  preflight_release "${current}"

  systemctl is-active --quiet npr-seminar-api.service \
    && systemctl is-active --quiet npr-seminar-worker.service \
    && wait_http http://127.0.0.1:4000/health/ready 15 \
    && verify_deferred_listener_boundaries \
    || die "deferred API/worker boundary is not healthy"

  revalidate_sheets_v4_for_web \
    || die "Sheets v4 is not privately shared, enabled, and ready; web remains stopped"
  verify_deferred_listener_boundaries \
    || die "listener boundary changed during Sheets validation; web remains stopped"

  if ! start_and_verify_web \
      || ! start_and_verify_caddy_upstream \
      || ! verify_listener_boundaries \
      || ! verify_public_https; then
    systemctl stop "${caddy_upstream_service}" "${caddy_upstream_socket}" || true
    systemctl stop npr-seminar-web.service || true
    die "web activation or public HTTPS readiness failed; deferred marker was preserved"
  fi
  rm -f -- "${web_deferred_marker}"
  log "web for $(basename "${current}") is active after fresh Sheets v4 validation"
}

rollback_release() {
  local requested=${1:-}
  validate_units
  migrate_runtime_environment
  validate_environment_boundaries
  validate_public_base_url
  install_units
  local target
  if [[ -n ${requested} ]]; then
    [[ ${requested} =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || die "invalid rollback stamp: ${requested}"
    target=${releases_dir}/${requested}
  else
    target=$(resolved_release_link "${previous_link}")
    [[ -n ${target} ]] || die "no previous release is recorded"
  fi
  [[ -d ${target} ]] || die "rollback release does not exist: ${target}"
  preflight_release "${target}"
  verify_authenticated_postgres_utc "${target}"
  local old_target
  old_target=$(activate_release "${target}")
  rm -f -- "${web_deferred_marker}"
  if ! start_and_verify_services; then
    recover_failed_activation "${old_target}"
    die "rollback target failed readiness checks"
  fi
  log "code rolled back to $(basename "${target}"); database migrations were not reversed"
}

main() {
  local action=${1:-deploy}
  if [[ ${action} == -h || ${action} == --help ]]; then
    usage
    return
  fi
  shift || true
  require_root_and_target
  require_tools
  exec 9>/run/lock/npr-seminar-deploy.lock
  flock -n 9 || die "another NPR deployment is running"
  ensure_accounts_and_directories

  case ${action} in
    deploy)
      while [[ $# -gt 0 ]]; do
        case $1 in
          --source)
            [[ $# -ge 2 ]] || die "--source requires a directory"
            source_dir=$2
            shift 2
            ;;
          --stamp)
            [[ $# -ge 2 ]] || die "--stamp requires a value"
            stamp=$2
            shift 2
            ;;
          --skip-migrations)
            run_migrations=false
            shift
            ;;
          --defer-web)
            defer_web=true
            shift
            ;;
          -h|--help)
            usage
            return
            ;;
          *) die "unknown deploy argument: $1" ;;
        esac
      done
      deploy_release
      ;;
    activate-web)
      [[ $# -eq 0 ]] || die "activate-web accepts no arguments"
      activate_deferred_web
      ;;
    rollback)
      [[ $# -le 1 ]] || die "rollback accepts at most one release stamp"
      rollback_release "${1:-}"
      ;;
    *)
      usage >&2
      die "unknown action: ${action}"
      ;;
  esac
}

main "$@"
