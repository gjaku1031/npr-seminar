#!/usr/bin/env bash
# 포스터 저장 디렉터리가 API 에만 주어지고 워커·web·마이그레이션에는 없는지 확인하는 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
installer=${repo_root}/ops/pve-release/install-datastores.sh
api_unit=${repo_root}/ops/pve-release/systemd/npr-seminar-api.service
worker_unit=${repo_root}/ops/pve-release/systemd/npr-seminar-worker.service
web_unit=${repo_root}/ops/pve-release/systemd/npr-seminar-web.service
storage=/var/lib/npr-seminar/poster

bash -n "${deploy}" "${installer}"

# 배포 스크립트의 디렉터리 생성·권한·env 기록
grep -Fq "readonly poster_storage_dir=${storage}" "${deploy}"
grep -Fq 'install -d -o "${api_user}" -g "${api_user}" -m 0750 "${poster_storage_dir}"' "${deploy}"
grep -Fq '"POSTER_STORAGE_DIR=${poster_storage_dir}"' "${deploy}"
grep -Fq 'SCANNER_PAIRING_HMAC_KEY QR_ENCRYPTION_KEY PUBLIC_BASE_URL POSTER_STORAGE_DIR TRUST_PROXY SMS_ENABLED' "${deploy}"
grep -Fq 'must use persistent poster storage at ${poster_storage_dir}' "${deploy}"
grep -Fq 'poster storage must be owned by ${api_user}:${api_user} with mode 0750' "${deploy}"

# 설치 스크립트와 systemd 유닛
grep -Fq "POSTER_STORAGE_DIR=${storage}" "${installer}"
grep -Fq 'EnvironmentFile=/etc/npr-seminar/api.env' "${api_unit}"
grep -Fq "ReadWritePaths=-${storage}" "${api_unit}"
grep -Fq 'UnsetEnvironment=POSTER_STORAGE_DIR' "${worker_unit}"
grep -Fq 'UnsetEnvironment=POSTER_STORAGE_DIR' "${web_unit}"

# env 작성 구간을 잘라 API 에만 포스터 경로가 있는지 확인
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

# 복수형 옛 경로가 남아 있지 않아야 함
plural_storage=/var/lib/npr-seminar/poster
plural_storage+=s
if rg -n -F "${plural_storage}" \
    "${repo_root}/apps/api" "${repo_root}/packages/contracts" "${repo_root}/ops/pve-release"; then
  echo "plural poster storage path remains" >&2
  exit 1
fi

printf 'poster storage static checks: ok\n'
