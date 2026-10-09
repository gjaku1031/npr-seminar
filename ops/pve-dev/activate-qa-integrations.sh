#!/usr/bin/env bash
# QA 서버에서 실제 문자 발송과 QA Google Sheets 반영을 켬. 모든 회차의 Sheet 매핑을 준비·활성화하고 API·워커 재시작 후 스모크 검사
# 실행: pve-dev 에서 root 로 실행(deploy-qa.sh 가 연동 env 가 있을 때 호출). 연동 env 와 빌드된 API 가 있어야 함
# 종료 코드: 0 성공, 1 사전 조건·설정 검증 실패(die), 그 밖은 하위 명령 실패
set -Eeuo pipefail

# 경로와 QA 전용 스프레드시트 ID
readonly script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
readonly source_dir=$(readlink -f -- "${script_dir}/../..")
readonly config_dir=/etc/npr-seminar-qa
readonly compose_file=${script_dir}/compose.yaml
readonly spreadsheet_id=1OPSt3laJ1p_1YKlxjgDoSIKhpQPHtVnlkYC9ESNWI7o
readonly control_entry=${source_dir}/apps/api/dist/modules/google-sheets/sheet-mapping-control.command.js

# 오류를 출력하고 종료 코드 1로 끝냄
die() { printf '[npr-qa-integrations] ERROR: %s\n' "$*" >&2; exit 1; }
# 실행 위치·필수 파일 확인
[[ ${EUID} -eq 0 ]] || die "run as root"
[[ $(hostname -s) == pve-dev ]] || die "refusing to run outside pve-dev"
for file in runtime.env worker.env integrations-api.env integrations-worker.env google-service-account.json; do
  [[ -r ${config_dir}/${file} ]] || die "missing ${config_dir}/${file}"
done
[[ -r ${control_entry} ]] || die "missing built Sheets control entrypoint"

# env 파일의 키 값이 기대값과 정확히 같은지 확인
require_env_value() {
  local file=$1 key=$2 expected=$3 actual
  actual=$(awk -F= -v key="${key}" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "${file}")
  [[ ${actual} == "${expected}" ]] \
    || die "${file} must set ${key}=${expected}"
}

# 연동 env 가 실제 발송·QA 시트를 가리키는지 확인
for integration_file in integrations-api.env integrations-worker.env; do
  require_env_value "${config_dir}/${integration_file}" SMS_ENABLED true
  require_env_value "${config_dir}/${integration_file}" SMS_RECIPIENT_ALLOWLIST_ENABLED false
  require_env_value "${config_dir}/${integration_file}" SMS_ALIGO_TEST_MODE false
done
require_env_value "${config_dir}/integrations-worker.env" GOOGLE_SHEETS_ENABLED true
require_env_value "${config_dir}/integrations-worker.env" GOOGLE_SHEETS_SPREADSHEET_ID "${spreadsheet_id}"

# 워커 env 를 읽어 Sheets 설정 재확인
set -a
# shellcheck disable=SC1091
source "${config_dir}/runtime.env"
# shellcheck disable=SC1091
source "${config_dir}/worker.env"
# shellcheck disable=SC1091
source "${config_dir}/integrations-worker.env"
set +a
[[ ${GOOGLE_SHEETS_ENABLED:-false} == true ]] || die "GOOGLE_SHEETS_ENABLED must be true"
[[ ${GOOGLE_SHEETS_SPREADSHEET_ID:-} == "${spreadsheet_id}" ]] || die "QA spreadsheet allowlist mismatch"

# 빌드된 API 의 시트 스키마 지문
schema_fingerprint=$(runuser -u ken -- env HOME=/home/ken /usr/bin/node --input-type=module \
  --eval "import { SHEET_SCHEMA_FINGERPRINT } from '${source_dir}/apps/api/dist/modules/google-sheets/google-sheets.gateway.js'; process.stdout.write(SHEET_SCHEMA_FINGERPRINT)")
[[ ${schema_fingerprint} =~ ^[0-9a-f]{64}$ ]] || die "invalid schema fingerprint"

# 모든 회차의 시트 매핑을 비활성 상태로 넣거나 갱신하고 매핑 ID 목록을 받음
mapfile -t mapping_ids < <(
  docker compose --project-name npr-seminar-qa --env-file "${config_dir}/runtime.env" -f "${compose_file}" \
    exec -T -e PGPASSWORD="${POSTGRES_PASSWORD}" postgres psql -qAt -U npr_migrator -d npr_seminar_qa \
    -v spreadsheet_id="${spreadsheet_id}" -v schema_fingerprint="${schema_fingerprint}" <<'SQL'
insert into sheet_mappings(
  seminar_session_public_id,spreadsheet_id,reservation_sheet_title,reservation_sheet_id,
  log_sheet_title,log_sheet_id,schema_fingerprint,schema_version,
  enabled,circuit_status,block_reason_code
)
select public_id, :'spreadsheet_id', '예약명단', 1777564107,
       '로그', 1415280656, :'schema_fingerprint', 4,
       false, 'BLOCKED', 'GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED'
  from seminar_sessions
on conflict(seminar_session_public_id) do update set
  spreadsheet_id=excluded.spreadsheet_id,
  reservation_sheet_title=excluded.reservation_sheet_title,
  reservation_sheet_id=excluded.reservation_sheet_id,
  log_sheet_title=excluded.log_sheet_title,
  log_sheet_id=excluded.log_sheet_id,
  schema_fingerprint=excluded.schema_fingerprint,
  schema_version=excluded.schema_version,
  enabled=false,
  circuit_status='BLOCKED',
  block_reason_code='GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED',
  dispatch_lease_owner=null,
  dispatch_lease_expires_at=null,
  updated_at=now();
select public_id from sheet_mappings order by id;
SQL
)
# 받은 매핑 ID 형식·개수 확인
for mapping_id in "${mapping_ids[@]}"; do
  [[ ${mapping_id} =~ ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] \
    || die "database returned an invalid mapping identifier"
done
[[ ${#mapping_ids[@]} -eq 6 ]] || die "expected six QA Sheet mappings, received ${#mapping_ids[@]}"

# 워커를 멈춘 채 매핑마다 준비·활성화. 중간에 실패해도 워커는 다시 시작함
systemctl stop npr-seminar-qa-worker.service 2>/dev/null || true
trap 'systemctl start npr-seminar-qa-worker.service >/dev/null 2>&1 || true' EXIT
for mapping_id in "${mapping_ids[@]}"; do
  runuser -u ken --preserve-environment -- /usr/bin/node "${control_entry}" \
    --mode=prepare --mapping-id="${mapping_id}" --confirm-spreadsheet-id="${spreadsheet_id}" >/dev/null
  runuser -u ken --preserve-environment -- /usr/bin/node "${control_entry}" \
    --mode=enable --mapping-id="${mapping_id}" --confirm-spreadsheet-id="${spreadsheet_id}" >/dev/null
done
# 새 설정으로 API·워커 재시작 후 스모크 검사
systemctl restart npr-seminar-qa-api.service npr-seminar-qa-worker.service
trap - EXIT
"${script_dir}/smoke-qa.sh"
printf '[npr-qa-integrations] Actual SMS and six QA Sheet mappings are enabled and loaded by the QA API/worker.\n'
