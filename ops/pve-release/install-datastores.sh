#!/usr/bin/env bash
set -Eeuo pipefail

if [[ ${EUID} -ne 0 ]]; then
  echo "run as root" >&2
  exit 1
fi

staging_dir=${1:?staging directory is required}
if [[ $(hostname -s) != "pve-release" ]]; then
  echo "refusing to run outside pve-release" >&2
  exit 1
fi

source /etc/os-release
if [[ ${VERSION_CODENAME:-} != "resolute" ]]; then
  echo "expected Ubuntu resolute" >&2
  exit 1
fi

for required_file in postgresql.conf redis.conf redis-override.conf sysctl.conf disable-thp.service backup-postgres.sh backup.service backup.timer; do
  if [[ ! -f "${staging_dir}/${required_file}" ]]; then
    echo "missing ${staging_dir}/${required_file}" >&2
    exit 1
  fi
done

if ! dpkg-query -W postgresql-18 redis-server >/dev/null 2>&1; then
  echo "PostgreSQL 18 and Redis must be installed first" >&2
  exit 1
fi

backup_stamp=$(date +%Y%m%d-%H%M%S)

systemctl stop redis-server.service
systemctl stop postgresql.service

install -d -o postgres -g postgres -m 0700 /srv/postgresql/18/main
if [[ ! -f /srv/postgresql/18/main/PG_VERSION ]]; then
  cp -a /var/lib/postgresql/18/main/. /srv/postgresql/18/main/
fi
chown -R postgres:postgres /srv/postgresql
chmod 0700 /srv/postgresql/18/main
pg_conftool 18 main set data_directory /srv/postgresql/18/main

install -d -o redis -g redis -m 0750 /srv/redis
if [[ -d /var/lib/redis && -z $(find /srv/redis -mindepth 1 -maxdepth 1 -print -quit) ]]; then
  cp -a /var/lib/redis/. /srv/redis/
fi
chown -R redis:redis /srv/redis

install -d -o root -g postgres -m 0750 /etc/postgresql/18/main/conf.d
install -o root -g postgres -m 0640 "${staging_dir}/postgresql.conf" /etc/postgresql/18/main/conf.d/99-npr.conf

if [[ ! -e /etc/redis/redis.conf.pre-npr ]]; then
  cp -a /etc/redis/redis.conf /etc/redis/redis.conf.pre-npr
fi
install -o root -g redis -m 0640 "${staging_dir}/redis.conf" /etc/redis/npr.conf
if ! grep -qxF 'include /etc/redis/npr.conf' /etc/redis/redis.conf; then
  printf '\n# NPR release overrides\ninclude /etc/redis/npr.conf\n' >> /etc/redis/redis.conf
fi

install -d -o root -g root -m 0755 /etc/systemd/system/redis-server.service.d
install -o root -g root -m 0644 "${staging_dir}/redis-override.conf" /etc/systemd/system/redis-server.service.d/override.conf
install -o root -g root -m 0644 "${staging_dir}/disable-thp.service" /etc/systemd/system/disable-transparent-huge-pages.service
install -o root -g root -m 0644 "${staging_dir}/sysctl.conf" /etc/sysctl.d/99-npr-datastores.conf
install -d -o postgres -g postgres -m 0750 /srv/backups/postgresql
install -o root -g root -m 0755 "${staging_dir}/backup-postgres.sh" /usr/local/sbin/backup-npr-postgres
install -o root -g root -m 0644 "${staging_dir}/backup.service" /etc/systemd/system/npr-postgres-backup.service
install -o root -g root -m 0644 "${staging_dir}/backup.timer" /etc/systemd/system/npr-postgres-backup.timer

# Keep a small emergency swap area so a transient app spike does not make the
# kernel kill PostgreSQL. swappiness=1 keeps normal database traffic in RAM.
swap_file=/swapfile.npr
if [[ ! -e ${swap_file} ]]; then
  fallocate -l 4G "${swap_file}"
  chmod 0600 "${swap_file}"
  mkswap "${swap_file}" >/dev/null
elif ! file "${swap_file}" | grep -q 'Linux swap file'; then
  echo "refusing to overwrite non-swap ${swap_file}" >&2
  exit 1
fi
if ! grep -qE '^/swapfile\.npr[[:space:]]' /etc/fstab; then
  printf '/swapfile.npr none swap sw 0 0\n' >> /etc/fstab
fi
if ! swapon --show=NAME --noheadings | grep -qx "${swap_file}"; then
  swapon "${swap_file}"
fi

getent group npr >/dev/null || groupadd --system npr
if ! id npr >/dev/null 2>&1; then
  useradd --system --gid npr --home-dir /srv/npr --create-home --shell /usr/sbin/nologin npr
fi
install -d -o root -g npr -m 0750 /etc/npr-seminar

runtime_env=/etc/npr-seminar/runtime.env
if [[ ! -f ${runtime_env} ]]; then
  umask 0027
  db_migrator_password=$(openssl rand -hex 32)
  db_app_password=$(openssl rand -hex 32)
  db_worker_password=$(openssl rand -hex 32)
  db_readonly_password=$(openssl rand -hex 32)
  redis_password=$(openssl rand -hex 32)
  session_secret=$(openssl rand -base64 32 | tr -d '\n')
  phone_encryption_key=$(openssl rand -base64 32 | tr -d '\n')
  phone_hmac_key=$(openssl rand -base64 32 | tr -d '\n')
  otp_pepper=$(openssl rand -base64 32 | tr -d '\n')
  scanner_pairing_hmac_key=$(openssl rand -base64 32 | tr -d '\n')
  qr_encryption_key=$(openssl rand -base64 32 | tr -d '\n')

  install -o root -g npr -m 0640 /dev/null "${runtime_env}"
  {
    printf 'DB_NAME=npr_seminar\n'
    printf 'DB_HOST=127.0.0.1\n'
    printf 'DB_PORT=5432\n'
    printf 'DB_MIGRATOR_USERNAME=npr_migrator\n'
    printf 'DB_MIGRATOR_PASSWORD=%s\n' "${db_migrator_password}"
    printf 'DB_APP_USERNAME=npr_app\n'
    printf 'DB_APP_PASSWORD=%s\n' "${db_app_password}"
    printf 'DB_WORKER_USERNAME=npr_worker\n'
    printf 'DB_WORKER_PASSWORD=%s\n' "${db_worker_password}"
    printf 'DB_READONLY_USERNAME=npr_readonly\n'
    printf 'DB_READONLY_PASSWORD=%s\n' "${db_readonly_password}"
    printf 'MIGRATION_DATABASE_URL=postgresql://npr_migrator:%s@127.0.0.1:5432/npr_seminar?application_name=npr_migrator\n' "${db_migrator_password}"
    printf 'DATABASE_URL=postgresql://npr_app:%s@127.0.0.1:5432/npr_seminar?application_name=npr_api\n' "${db_app_password}"
    printf 'WORKER_DATABASE_URL=postgresql://npr_worker:%s@127.0.0.1:5432/npr_seminar?application_name=npr_worker\n' "${db_worker_password}"
    printf 'REDIS_HOST=127.0.0.1\n'
    printf 'REDIS_PORT=6379\n'
    printf 'REDIS_USERNAME=npr\n'
    printf 'REDIS_PASSWORD=%s\n' "${redis_password}"
    printf 'REDIS_KEY_PREFIX=npr:\n'
    printf 'REDIS_URL=redis://npr:%s@127.0.0.1:6379/0\n' "${redis_password}"
    printf 'APP_ENV=production\n'
    printf 'PORT=4000\n'
    printf 'TRUST_PROXY=1\n'
    printf 'PUBLIC_BASE_URL=https://npr-survey.tailedbbb5.ts.net\n'
    printf 'SESSION_SECRET=%s\n' "${session_secret}"
    printf 'PHONE_ENCRYPTION_KEY=%s\n' "${phone_encryption_key}"
    printf 'PHONE_HMAC_KEY=%s\n' "${phone_hmac_key}"
    printf 'OTP_PEPPER=%s\n' "${otp_pepper}"
    printf 'SCANNER_PAIRING_HMAC_KEY=%s\n' "${scanner_pairing_hmac_key}"
    printf 'QR_ENCRYPTION_KEY=%s\n' "${qr_encryption_key}"
    printf 'SMS_ENABLED=false\n'
    printf 'SMS_RECIPIENT_ALLOWLIST_ENABLED=true\n'
    printf 'SMS_ALIGO_TEST_MODE=true\n'
    printf 'GOOGLE_SHEETS_ENABLED=false\n'
    printf 'GOOGLE_SHEETS_ALLOW_PUBLIC_WRITER_IN_DEVELOPMENT=false\n'
    printf 'GOOGLE_SHEETS_SPREADSHEET_ID=1hOYWwKHpk_tchht6MVQ1dEwoW9iT7qJbzQRlLXUKpP0\n'
    printf 'TONG_SYNC_ENABLED=false\n'
  } > "${runtime_env}"
  chown root:npr "${runtime_env}"
  chmod 0640 "${runtime_env}"
fi

set -a
source "${runtime_env}"
set +a

admin_env=/etc/npr-seminar/admin.env
if [[ ! -f ${admin_env} ]]; then
  redis_admin_password=$(openssl rand -hex 32)
  install -o root -g root -m 0600 /dev/null "${admin_env}"
  printf 'REDIS_ADMIN_USERNAME=npr_admin\nREDIS_ADMIN_PASSWORD=%s\n' "${redis_admin_password}" > "${admin_env}"
  chown root:root "${admin_env}"
  chmod 0600 "${admin_env}"
fi

set -a
source "${admin_env}"
set +a

install -o root -g redis -m 0640 /dev/null /etc/redis/users.acl
{
  printf 'user default off\n'
  printf 'user npr on >%s ~npr:* +@connection +get +set +del +exists +incr +expire +ttl +sadd +smembers +eval\n' "${REDIS_PASSWORD}"
  printf 'user npr_admin on >%s ~* &* +@all\n' "${REDIS_ADMIN_PASSWORD}"
} > /etc/redis/users.acl
chown root:redis /etc/redis/users.acl
chmod 0640 /etc/redis/users.acl

sysctl --system >/dev/null
systemctl daemon-reload
systemctl enable --now disable-transparent-huge-pages.service

sudo -u postgres /usr/lib/postgresql/18/bin/postgres \
  -D /srv/postgresql/18/main \
  -C data_directory \
  -c config_file=/etc/postgresql/18/main/postgresql.conf >/dev/null

systemctl enable postgresql.service
systemctl start postgresql.service
for attempt in {1..30}; do
  if sudo -u postgres /usr/lib/postgresql/18/bin/pg_isready -q; then
    break
  fi
  if [[ ${attempt} -eq 30 ]]; then
    echo "PostgreSQL did not become ready" >&2
    exit 1
  fi
  sleep 1
done

sudo -u postgres psql -X --set=ON_ERROR_STOP=1 postgres >/dev/null <<SQL
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npr_migrator') THEN
    CREATE ROLE npr_migrator LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npr_app') THEN
    CREATE ROLE npr_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npr_worker') THEN
    CREATE ROLE npr_worker LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npr_readonly') THEN
    CREATE ROLE npr_readonly LOGIN;
  END IF;
END
\$do\$;

ALTER ROLE npr_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${DB_MIGRATOR_PASSWORD}';
ALTER ROLE npr_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${DB_APP_PASSWORD}';
ALTER ROLE npr_worker WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${DB_WORKER_PASSWORD}';
ALTER ROLE npr_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${DB_READONLY_PASSWORD}';

SELECT 'CREATE DATABASE npr_seminar OWNER npr_migrator ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'npr_seminar')
\gexec

REVOKE CONNECT ON DATABASE npr_seminar FROM PUBLIC;
GRANT CONNECT ON DATABASE npr_seminar TO npr_migrator, npr_app, npr_worker, npr_readonly;
ALTER DATABASE npr_seminar SET timezone = 'UTC';
ALTER ROLE npr_migrator SET timezone = 'UTC';
ALTER ROLE npr_app SET timezone = 'UTC';
ALTER ROLE npr_worker SET timezone = 'UTC';
ALTER ROLE npr_readonly SET timezone = 'UTC';
ALTER ROLE npr_app SET statement_timeout = '15s';
ALTER ROLE npr_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE npr_worker SET statement_timeout = '30s';
ALTER ROLE npr_worker SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE npr_readonly SET default_transaction_read_only = on;
ALTER ROLE npr_readonly SET statement_timeout = '30s';
SQL

sudo -u postgres psql -X --set=ON_ERROR_STOP=1 npr_seminar >/dev/null <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO npr_migrator;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

GRANT USAGE ON SCHEMA public TO npr_app, npr_worker, npr_readonly;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO npr_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO npr_app;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO npr_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO npr_readonly;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO npr_readonly;

ALTER DEFAULT PRIVILEGES FOR ROLE npr_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO npr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE npr_migrator IN SCHEMA public
  REVOKE DELETE ON TABLES FROM npr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE npr_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO npr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE npr_migrator IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO npr_app;
ALTER DEFAULT PRIVILEGES FOR ROLE npr_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO npr_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE npr_migrator IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO npr_readonly;
SQL

systemctl enable redis-server.service
systemctl start redis-server.service
for attempt in {1..30}; do
  if REDISCLI_AUTH="${REDIS_PASSWORD}" redis-cli --user npr -h 127.0.0.1 --no-auth-warning PING 2>/dev/null | grep -qx PONG; then
    break
  fi
  if [[ ${attempt} -eq 30 ]]; then
    echo "Redis did not become ready" >&2
    exit 1
  fi
  sleep 1
done

redis_app_cli() {
  REDISCLI_AUTH="${REDIS_PASSWORD}" redis-cli --user npr -h 127.0.0.1 --no-auth-warning "$@" 2>/dev/null
}
redis_probe="npr:acl-probe:${backup_stamp}:$$"
[[ $(redis_app_cli SET "${redis_probe}:counter" 0 EX 60) == OK ]]
[[ $(redis_app_cli GET "${redis_probe}:counter") == 0 ]]
[[ $(redis_app_cli INCR "${redis_probe}:counter") == 1 ]]
[[ $(redis_app_cli EXPIRE "${redis_probe}:counter" 60) == 1 ]]
redis_probe_ttl=$(redis_app_cli TTL "${redis_probe}:counter")
[[ ${redis_probe_ttl} =~ ^[0-9]+$ && ${redis_probe_ttl} -le 60 ]]
[[ $(redis_app_cli SADD "${redis_probe}:set" member) == 1 ]]
[[ $(redis_app_cli SMEMBERS "${redis_probe}:set") == member ]]
redis_eval_probe="if redis.call('EXISTS',KEYS[1])==1 then return 0 end; redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[2]); local value=redis.call('GET',KEYS[1]); redis.call('DEL',KEYS[1]); if value==ARGV[1] then return 1 else return 0 end"
[[ $(redis_app_cli EVAL "${redis_eval_probe}" 1 "${redis_probe}:lua" verified 60) == 1 ]]
[[ $(redis_app_cli DEL "${redis_probe}:counter" "${redis_probe}:set") == 2 ]]
unset -f redis_app_cli

sudo -u postgres psql -X -d postgres -Atqc 'show timezone' | grep -qx UTC
PGPASSWORD="${DB_MIGRATOR_PASSWORD}" psql -X -h 127.0.0.1 -U npr_migrator -d npr_seminar -Atqc 'show timezone' | grep -qx UTC
PGPASSWORD="${DB_APP_PASSWORD}" psql -X -h 127.0.0.1 -U npr_app -d npr_seminar -Atqc 'show timezone' | grep -qx UTC
PGPASSWORD="${DB_WORKER_PASSWORD}" psql -X -h 127.0.0.1 -U npr_worker -d npr_seminar -Atqc 'show timezone' | grep -qx UTC
PGPASSWORD="${DB_READONLY_PASSWORD}" psql -X -h 127.0.0.1 -U npr_readonly -d npr_seminar -Atqc 'show timezone' | grep -qx UTC
systemctl enable --now npr-postgres-backup.timer

echo "PostgreSQL and Redis configuration completed"
echo "backup stamp: ${backup_stamp}"
