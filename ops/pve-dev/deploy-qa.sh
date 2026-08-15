#!/usr/bin/env bash
set -Eeuo pipefail

readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly source_dir=$(readlink -f -- "${script_dir}/../..")
readonly config_dir=/etc/npr-seminar-qa
readonly unit_dir=/etc/systemd/system
readonly pnpm_cli=/home/ken/.cache/node/corepack/pnpm/11.10.0/bin/pnpm.cjs
readonly admin_password_file=${config_dir}/admin-password

die() { printf '[npr-qa-deploy] ERROR: %s\n' "$*" >&2; exit 1; }
[[ ${EUID} -eq 0 ]] || die "run as root"
[[ $(hostname -s) == pve-dev ]] || die "refusing to run outside pve-dev"
for command_name in curl install readlink runuser systemctl; do
  command -v "${command_name}" >/dev/null 2>&1 || die "missing command: ${command_name}"
done
[[ -r ${pnpm_cli} ]] || die "missing pnpm CLI: ${pnpm_cli}"

"${script_dir}/install-datastores.sh"
for file in migration.env seed.env api.env worker.env web.env; do
  [[ -f ${config_dir}/${file} ]] || die "missing ${config_dir}/${file}"
done

run_with_env() {
  local env_file=$1
  shift
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
  HOME=/home/ken runuser -u ken --preserve-environment -- "$@"
}

run_with_env "${config_dir}/migration.env" /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/api db:migrate:deploy
runuser -u ken -- env HOME=/home/ken /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/api build
run_with_env "${config_dir}/web.env" /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/web build

set -a
# shellcheck disable=SC1090
source "${config_dir}/runtime.env"
set +a
student_count=$(docker compose --project-name npr-seminar-qa --env-file "${config_dir}/runtime.env" \
  -f "${script_dir}/compose.yaml" exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql -qAt -U npr_migrator -d npr_seminar_qa -c 'select count(*) from students')
if [[ ${QA_FORCE_RESEED:-false} == true ]]; then
  [[ ${QA_DATA_CONFIRMATION:-} == 'SEED NPR SYNTHETIC QA' ]] \
    || die "QA_FORCE_RESEED requires QA_DATA_CONFIRMATION='SEED NPR SYNTHETIC QA'"
  student_count=0
elif [[ ${student_count} != 0 && ${student_count} != 3382 ]]; then
  die "refusing to overwrite a non-empty, non-baseline QA database (${student_count} students)"
fi
if [[ ${student_count} == 0 ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${config_dir}/seed.env"
  set +a
  QA_DATA_CONFIRMATION='SEED NPR SYNTHETIC QA' HOME=/home/ken \
    runuser -u ken --preserve-environment -- /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/api db:seed:qa
else
  printf '[npr-qa-deploy] Existing QA data retained; synthetic seed skipped.\n'
fi
[[ -r ${admin_password_file} ]] || die "missing ${admin_password_file}"
run_with_env "${config_dir}/api.env" /usr/bin/env \
  ADMIN_BOOTSTRAP_USERNAME=admin \
  'ADMIN_BOOTSTRAP_DISPLAY_NAME=QA 관리자' \
  ADMIN_BOOTSTRAP_ALLOW_INSECURE_QA_CREDENTIAL=true \
  ADMIN_BOOTSTRAP_PASSWORD_FD=3 \
  /usr/bin/node "${source_dir}/apps/api/dist/commands/bootstrap-admin.js" \
  --rotate \
  3< "${admin_password_file}"

# Keep one predictable tester identity in the isolated QA database.  Retiring
# previous bootstrap accounts also prevents an old credential from silently
# remaining valid after a redeploy.
docker compose --project-name npr-seminar-qa --env-file "${config_dir}/runtime.env" \
  -f "${script_dir}/compose.yaml" exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres \
  psql -v ON_ERROR_STOP=1 -U npr_migrator -d npr_seminar_qa <<'SQL'
with retired as (
  update admin_users
     set active=false, updated_at=now()
   where role='ADMIN' and username <> 'admin' and active=true
  returning id, public_id
)
insert into auth_audits(admin_user_id,actor_subject,event_type,result_code,safe_metadata)
select id,public_id::text,'ADMIN_BOOTSTRAP','QA_NON_TESTER_ADMIN_DEACTIVATED','{}'::jsonb
  from retired;
SQL

for unit in "${script_dir}"/systemd/*; do
  install -o root -g root -m 0644 "${unit}" "${unit_dir}/$(basename "${unit}")"
done
systemctl daemon-reload
systemctl enable --now npr-seminar-qa-api.service npr-seminar-qa-worker.service npr-seminar-qa-web.service
systemctl enable --now npr-seminar-qa-frontdoor.socket
systemctl restart npr-seminar-qa-api.service npr-seminar-qa-worker.service npr-seminar-qa-web.service

if command -v tailscale >/dev/null 2>&1 && [[ ${QA_CONFIGURE_FUNNEL:-true} == true ]]; then
  tailscale funnel --bg --https=443 http://127.0.0.1:3000
fi
if [[ -r ${config_dir}/integrations-api.env && -r ${config_dir}/integrations-worker.env ]]; then
  # A source deployment can change the Sheet schema fingerprint. Re-prepare the
  # isolated workbook and restart both processes so optional overrides cannot
  # remain present on disk but absent from the effective runtime environment.
  "${script_dir}/activate-qa-integrations.sh"
else
  "${script_dir}/smoke-qa.sh"
fi
printf '[npr-qa-deploy] Internet-public Funnel ready at https://pve-dev.example.ts.net (front door 127.0.0.1:3000).\n'
