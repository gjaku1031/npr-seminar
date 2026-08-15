#!/usr/bin/env bash
set -Eeuo pipefail

readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly config_dir=/etc/npr-seminar-qa
readonly secrets_file=${config_dir}/runtime.env
readonly admin_password_file=${config_dir}/admin-password
readonly compose_file=${script_dir}/compose.yaml

die() { printf '[npr-qa-datastores] ERROR: %s\n' "$*" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || die "run as root"
[[ $(hostname -s) == pve-dev ]] || die "refusing to run outside pve-dev"
for command_name in docker openssl install awk grep; do
  command -v "${command_name}" >/dev/null 2>&1 || die "missing command: ${command_name}"
done
docker compose version >/dev/null

# Service environment files stay root-only, while the worker needs execute-only
# traversal to open its own mode-0600 Google service-account credential.
install -d -o root -g ken -m 0710 "${config_dir}"
if [[ ! -e ${secrets_file} ]]; then
  umask 077
  {
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'NPR_APP_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'NPR_WORKER_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'REDIS_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    for key in SESSION_SECRET PHONE_ENCRYPTION_KEY PHONE_HMAC_KEY OTP_PEPPER SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY; do
      printf '%s=%s\n' "${key}" "$(openssl rand -base64 32 | tr -d '\n')"
    done
  } > "${secrets_file}"
  chown root:root "${secrets_file}"
  chmod 0600 "${secrets_file}"
fi
[[ -f ${secrets_file} && ! -L ${secrets_file} ]] || die "runtime.env must be a regular file"
[[ $(stat -c '%u:%g:%a' "${secrets_file}") == 0:0:600 ]] || die "runtime.env must be root:root mode 0600"
# This internet-public stack contains synthetic QA data and deliberately uses
# the fixed tester credential requested by the product owner.  Production and
# pve-release never source this file or this installer.
umask 077
printf 'admin\n' > "${admin_password_file}"
chown root:root "${admin_password_file}"
chmod 0600 "${admin_password_file}"
[[ -f ${admin_password_file} && ! -L ${admin_password_file} ]] || die "admin-password must be a regular file"
[[ $(stat -c '%u:%g:%a' "${admin_password_file}") == 0:0:600 ]] || die "admin-password must be root:root mode 0600"
admin_password=$(<"${admin_password_file}")
if [[ ${admin_password} != admin ]]; then
  unset admin_password
  die "the isolated QA administrator password must be the fixed tester value"
fi
unset admin_password
set -a
# shellcheck disable=SC1090
source "${secrets_file}"
set +a

docker compose --project-name npr-seminar-qa --env-file "${secrets_file}" -f "${compose_file}" up -d
for _ in $(seq 1 60); do
  if docker compose --project-name npr-seminar-qa --env-file "${secrets_file}" -f "${compose_file}" \
      exec -T postgres pg_isready -U npr_migrator -d npr_seminar_qa -h 127.0.0.1 >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose --project-name npr-seminar-qa --env-file "${secrets_file}" -f "${compose_file}" \
  exec -T postgres pg_isready -U npr_migrator -d npr_seminar_qa -h 127.0.0.1 >/dev/null \
  || die "PostgreSQL did not become ready"

docker compose --project-name npr-seminar-qa --env-file "${secrets_file}" -f "${compose_file}" \
  exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql -v ON_ERROR_STOP=1 -U npr_migrator -d npr_seminar_qa \
    -v app_password="${NPR_APP_PASSWORD}" -v worker_password="${NPR_WORKER_PASSWORD}" <<'SQL'
select format('create role npr_app login password %L', :'app_password')
 where not exists(select 1 from pg_roles where rolname='npr_app') \gexec
select format('create role npr_worker login password %L', :'worker_password')
 where not exists(select 1 from pg_roles where rolname='npr_worker') \gexec
alter role npr_app password :'app_password';
alter role npr_worker password :'worker_password';
grant connect on database npr_seminar_qa to npr_app,npr_worker;
create extension if not exists pg_stat_statements;
SQL

umask 077
cat > "${config_dir}/migration.env" <<EOF
APP_ENV=staging
MIGRATION_DATABASE_URL=postgresql://npr_migrator:${POSTGRES_PASSWORD}@127.0.0.1:55432/npr_seminar_qa
SMS_ENABLED=false
GOOGLE_SHEETS_ENABLED=false
TONG_SYNC_ENABLED=false
EOF
cat > "${config_dir}/api.env" <<EOF
APP_ENV=staging
PROCESS_ROLE=api
PORT=4100
DATABASE_URL=postgresql://npr_app:${NPR_APP_PASSWORD}@127.0.0.1:55432/npr_seminar_qa
REDIS_URL=redis://npr_qa:${REDIS_PASSWORD}@127.0.0.1:56379
SESSION_SECRET=${SESSION_SECRET}
PHONE_ENCRYPTION_KEY=${PHONE_ENCRYPTION_KEY}
PHONE_HMAC_KEY=${PHONE_HMAC_KEY}
OTP_PEPPER=${OTP_PEPPER}
SCANNER_PAIRING_HMAC_KEY=${SCANNER_PAIRING_HMAC_KEY}
QR_ENCRYPTION_KEY=${QR_ENCRYPTION_KEY}
PUBLIC_BASE_URL=https://pve-dev.tailedbbb5.ts.net
SMS_ENABLED=false
SMS_RECIPIENT_ALLOWLIST_ENABLED=true
SMS_ALIGO_TEST_MODE=true
GOOGLE_SHEETS_ENABLED=false
TRUST_PROXY=1
TONG_SYNC_ENABLED=false
TONG_WIRE_CONTRACT_CONFIRMED=false
EOF
cat > "${config_dir}/worker.env" <<EOF
APP_ENV=staging
PROCESS_ROLE=worker
WORKER_DATABASE_URL=postgresql://npr_worker:${NPR_WORKER_PASSWORD}@127.0.0.1:55432/npr_seminar_qa
PHONE_ENCRYPTION_KEY=${PHONE_ENCRYPTION_KEY}
PUBLIC_BASE_URL=https://pve-dev.tailedbbb5.ts.net
SMS_ENABLED=false
SMS_RECIPIENT_ALLOWLIST_ENABLED=true
SMS_ALIGO_TEST_MODE=true
GOOGLE_SHEETS_ENABLED=false
TONG_SYNC_ENABLED=false
TONG_WIRE_CONTRACT_CONFIRMED=false
EOF
cat > "${config_dir}/web.env" <<'EOF'
NODE_ENV=production
PORT=3100
HOSTNAME=127.0.0.1
NEST_API_ORIGIN=http://127.0.0.1:4100
EOF
cat > "${config_dir}/seed.env" <<EOF
APP_ENV=staging
DATABASE_URL=postgresql://npr_migrator:${POSTGRES_PASSWORD}@127.0.0.1:55432/npr_seminar_qa
PHONE_ENCRYPTION_KEY=${PHONE_ENCRYPTION_KEY}
PHONE_HMAC_KEY=${PHONE_HMAC_KEY}
QR_ENCRYPTION_KEY=${QR_ENCRYPTION_KEY}
SMS_ENABLED=false
GOOGLE_SHEETS_ENABLED=false
TONG_SYNC_ENABLED=false
EOF
chown root:root "${config_dir}"/*.env
chmod 0600 "${config_dir}"/*.env

docker compose --project-name npr-seminar-qa --env-file "${secrets_file}" -f "${compose_file}" \
  exec -T redis redis-cli --no-auth-warning --user npr_qa -a "${REDIS_PASSWORD}" ping | grep -qx PONG \
  || die "Redis did not become ready"
printf '[npr-qa-datastores] PostgreSQL 127.0.0.1:55432 and Redis 127.0.0.1:56379 are ready.\n'
