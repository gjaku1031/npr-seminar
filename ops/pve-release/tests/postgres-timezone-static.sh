#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
installer=${repo_root}/ops/pve-release/install-datastores.sh
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
postgres_config=${repo_root}/ops/pve-release/postgresql/99-npr.conf
audit_sql=${repo_root}/ops/pve-release/audit-timestamptz-offset.sql
readme=${repo_root}/ops/pve-release/README.md

bash -n "${installer}" "${deploy}"
grep -Eq "^[[:space:]]*timezone[[:space:]]*=[[:space:]]*'UTC'[[:space:]]*$" "${postgres_config}"
! grep -Fq "timezone = 'Asia/Seoul'" "${postgres_config}"
grep -Fq "ALTER DATABASE npr_seminar SET timezone = 'UTC';" "${installer}"
for role in npr_migrator npr_app npr_worker npr_readonly; do
  grep -Fq "ALTER ROLE ${role} SET timezone = 'UTC';" "${installer}"
done
[[ $(grep -Fc 'verify_authenticated_postgres_utc "${release}"' "${deploy}") -eq 1 ]]
grep -Fq 'verify_authenticated_postgres_utc "${target}"' "${deploy}"
grep -Fq 'result.rows[0]?.timezone !== "UTC"' "${deploy}"
grep -Fq 'Existing Asia/Seoul VM UTC cutover' "${readme}"
grep -Fq 'systemctl stop npr-seminar-api.service npr-seminar-worker.service' "${readme}"
grep -Fq 'The preflight is intentionally fail-closed' "${readme}"
grep -Fq '`Asia/Seoul` application session' "${readme}"

grep -Fq 'BEGIN TRANSACTION READ ONLY;' "${audit_sql}"
grep -Fq "SET LOCAL TIME ZONE 'UTC';" "${audit_sql}"
grep -Fq "data_type = 'timestamp with time zone'" "${audit_sql}"
grep -Fq 'exact_nine_hours_behind' "${audit_sql}"
grep -Fq 'COMMIT;' "${audit_sql}"
if sed '/^[[:space:]]*--/d' "${audit_sql}" | grep -Eiq '\<(insert|update|delete|alter|create|drop|truncate|copy|grant|revoke)\>'; then
  printf 'read-only audit SQL contains a forbidden statement\n' >&2
  exit 1
fi

printf 'PostgreSQL UTC static checks: ok\n'
