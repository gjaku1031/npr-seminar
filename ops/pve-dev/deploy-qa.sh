#!/usr/bin/env bash
# QA 서버(pve-dev) 배포. 데이터 저장소 준비, 마이그레이션·빌드, 합성 데이터 시드, QA 관리자 계정 설정, systemd 유닛 설치·재시작, 연동·스모크 검사
# 실행: pve-dev 에서 root 로 저장소 체크아웃의 ops/pve-dev/deploy-qa.sh 실행
#   QA_FORCE_RESEED=true 와 QA_DATA_CONFIRMATION='SEED NPR SYNTHETIC QA' 를 함께 주면 기존 데이터를 다시 시드
#   QA_CONFIGURE_FUNNEL=false 면 Tailscale Funnel 설정을 건너뜀
# 종료 코드: 0 성공, 1 사전 조건 실패·기존 데이터 보호(die), 그 밖은 하위 명령 실패
set -Eeuo pipefail

# 경로와 고정 pnpm·관리자 비밀번호 파일
readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly source_dir=$(readlink -f -- "${script_dir}/../..")
readonly config_dir=/etc/npr-seminar-qa
readonly unit_dir=/etc/systemd/system
readonly pnpm_cli=/home/ken/.cache/node/corepack/pnpm/11.10.0/bin/pnpm.cjs
readonly admin_password_file=${config_dir}/admin-password

# 오류를 출력하고 종료 코드 1로 끝냄
die() { printf '[npr-qa-deploy] ERROR: %s\n' "$*" >&2; exit 1; }
# 실행 위치·필수 명령 확인
[[ ${EUID} -eq 0 ]] || die "run as root"
[[ $(hostname -s) == pve-dev ]] || die "refusing to run outside pve-dev"
for command_name in curl install readlink runuser systemctl; do
  command -v "${command_name}" >/dev/null 2>&1 || die "missing command: ${command_name}"
done
[[ -r ${pnpm_cli} ]] || die "missing pnpm CLI: ${pnpm_cli}"

# 데이터 저장소와 env 파일 준비
"${script_dir}/install-datastores.sh"
for file in migration.env seed.env api.env worker.env web.env; do
  [[ -f ${config_dir}/${file} ]] || die "missing ${config_dir}/${file}"
done

# env 파일을 읽은 뒤 ken 계정으로 명령 실행
run_with_env() {
  local env_file=$1
  shift
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
  HOME=/home/ken runuser -u ken --preserve-environment -- "$@"
}

# 마이그레이션, API·web 빌드
run_with_env "${config_dir}/migration.env" /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/api db:migrate:deploy
runuser -u ken -- env HOME=/home/ken /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/api build
run_with_env "${config_dir}/web.env" /usr/bin/node "${pnpm_cli}" --dir "${source_dir}" --filter @npr-seminar/web build

# 학생 수로 시드 여부 판단. 비어 있거나 합성 기준치(3382명)일 때만 덮어씀
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
# 고정 QA 관리자 계정 비밀번호 갱신
[[ -r ${admin_password_file} ]] || die "missing ${admin_password_file}"
run_with_env "${config_dir}/api.env" /usr/bin/env \
  ADMIN_BOOTSTRAP_USERNAME=admin \
  'ADMIN_BOOTSTRAP_DISPLAY_NAME=QA 관리자' \
  ADMIN_BOOTSTRAP_ALLOW_INSECURE_QA_CREDENTIAL=true \
  ADMIN_BOOTSTRAP_PASSWORD_FD=3 \
  /usr/bin/node "${source_dir}/apps/api/dist/commands/bootstrap-admin.js" \
  --rotate \
  3< "${admin_password_file}"

# 격리된 QA DB 에는 예측 가능한 테스트 계정 하나만 둠
# 이전 bootstrap 계정을 비활성화해 재배포 뒤 옛 자격이 남지 않게 함
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

# systemd 유닛 설치·시작·재시작
for unit in "${script_dir}"/systemd/*; do
  install -o root -g root -m 0644 "${unit}" "${unit_dir}/$(basename "${unit}")"
done
systemctl daemon-reload
systemctl enable --now npr-seminar-qa-api.service npr-seminar-qa-worker.service npr-seminar-qa-web.service
systemctl enable --now npr-seminar-qa-frontdoor.socket
systemctl restart npr-seminar-qa-api.service npr-seminar-qa-worker.service npr-seminar-qa-web.service

# Tailscale Funnel 로 QA 진입점 공개
if command -v tailscale >/dev/null 2>&1 && [[ ${QA_CONFIGURE_FUNNEL:-true} == true ]]; then
  tailscale funnel --bg --https=443 http://127.0.0.1:3000
fi
if [[ -r ${config_dir}/integrations-api.env && -r ${config_dir}/integrations-worker.env ]]; then
  # 소스 배포로 시트 스키마 지문이 바뀔 수 있음
  # 격리 워크북을 다시 준비하고 두 프로세스를 재시작해 디스크의 연동 설정이 실행 환경에서 빠지지 않게 함
  "${script_dir}/activate-qa-integrations.sh"
else
  "${script_dir}/smoke-qa.sh"
fi
printf '[npr-qa-deploy] Internet-public Funnel ready at https://pve-dev.example.ts.net (front door 127.0.0.1:3000).\n'
