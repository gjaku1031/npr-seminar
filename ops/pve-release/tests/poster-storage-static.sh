#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
installer=${repo_root}/ops/pve-release/install-datastores.sh
api_unit=${repo_root}/ops/pve-release/systemd/npr-seminar-api.service
worker_unit=${repo_root}/ops/pve-release/systemd/npr-seminar-worker.service
web_unit=${repo_root}/ops/pve-release/systemd/npr-seminar-web.service
storage=/var/lib/npr-seminar/poster

bash -n "${deploy}" "${installer}"

grep -Fq "readonly poster_storage_dir=${storage}" "${deploy}"
grep -Fq 'install -d -o "${api_user}" -g "${api_user}" -m 0750 "${poster_storage_dir}"' "${deploy}"
grep -Fq '"POSTER_STORAGE_DIR=${poster_storage_dir}"' "${deploy}"
grep -Fq 'SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY PUBLIC_BASE_URL POSTER_STORAGE_DIR TRUST_PROXY SMS_ENABLED' "${deploy}"
grep -Fq 'must use persistent poster storage at ${poster_storage_dir}' "${deploy}"
grep -Fq 'poster storage must be owned by ${api_user}:${api_user} with mode 0750' "${deploy}"

grep -Fq "POSTER_STORAGE_DIR=${storage}" "${installer}"
grep -Fq 'EnvironmentFile=/etc/npr-seminar/api.env' "${api_unit}"
grep -Fq "ReadWritePaths=-${storage}" "${api_unit}"
grep -Fq 'UnsetEnvironment=POSTER_STORAGE_DIR' "${worker_unit}"
grep -Fq 'UnsetEnvironment=POSTER_STORAGE_DIR' "${web_unit}"

DEPLOY_FIXTURE=${deploy} node - <<'NODE'
const fs = require("node:fs");
const source = fs.readFileSync(process.env.DEPLOY_FIXTURE, "utf8");

const exactWriter = (target, nextTarget) => {
  const start = source.indexOf(`write_environment_exact "${target}"`);
  const end = source.indexOf(nextTarget, start + 1);
  if (start < 0 || end < 0) process.exit(1);
  return source.slice(start, end);
};

const api = exactWriter("${api_env}", "install_tong_api_environment");
const worker = exactWriter("${worker_env}", "queue_env_value NEST_API_ORIGIN");
if (!api.includes("POSTER_STORAGE_DIR")) process.exit(1);
if (worker.includes("POSTER_STORAGE_DIR")) process.exit(1);

for (const target of ["worker_env", "web_env", "migration_env"]) {
  const pattern = new RegExp(`for \\w+ in [^;]*POSTER_STORAGE_DIR[^;]*; do[\\s\\S]*?forbid_env_key "\\$\\{${target}\\}"`, "u");
  if (!pattern.test(source)) process.exit(1);
}

const migrationStart = source.indexOf('runuser -u "${migrate_user}" -- env -i');
const migrationEnd = source.indexOf("apply_worker_database_grants", migrationStart);
const migration = source.slice(migrationStart, migrationEnd);
if (!migration.includes("env -i") || migration.includes("POSTER_STORAGE_DIR")) process.exit(1);
NODE

plural_storage=/var/lib/npr-seminar/poster
plural_storage+=s
if rg -n -F "${plural_storage}" \
    "${repo_root}/apps/api" "${repo_root}/packages/contracts" "${repo_root}/ops/pve-release"; then
  echo "plural poster storage path remains" >&2
  exit 1
fi

printf 'poster storage static checks: ok\n'
