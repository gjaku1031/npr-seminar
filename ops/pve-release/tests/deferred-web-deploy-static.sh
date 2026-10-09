#!/usr/bin/env bash
# web 지연 활성화 배포(--defer-web, activate-web) 경로가 배포 스크립트에 있는지 확인하는 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh

bash -n "${deploy}"

# 배포 잠금은 한 곳에서만 잡고, 지연 활성화·복구·시트 재검증 단계가 있어야 함
[[ $(grep -Fc 'exec 9>/run/lock/npr-seminar-deploy.lock' "${deploy}") -eq 1 ]]
grep -Fq 'deploy-nest-release.sh activate-web' "${deploy}"
grep -Fq -- '--defer-web)' "${deploy}"
grep -Fq 'start_and_verify_deferred_services' "${deploy}"
grep -Fq 'systemctl stop npr-seminar-web.service' "${deploy}"
grep -Fq 'verify_deferred_listener_boundaries' "${deploy}"
grep -Fq 'revalidate_sheets_v4_for_web' "${deploy}"
grep -Fq 'NPR_DEPLOY_LOCK_HELD=true "${current_link}/ops/pve-release/google-sheets-control.sh"' "${deploy}"
grep -Fq 'google-sheets-control.sh" \' "${deploy}"
grep -Fq 'enable "${mapping_id}" "${spreadsheet_id}"' "${deploy}"
grep -Fq 'deferred marker does not match the current release' "${deploy}"
grep -Fq 'systemctl stop "${caddy_upstream_service}" "${caddy_upstream_socket}"' "${deploy}"
grep -Fq "\$4 ~ /:(3000|3001)\$/" "${deploy}"
grep -Fq 'start_and_verify_caddy_upstream' "${deploy}"
grep -Fq 'verify_public_https' "${deploy}"
grep -Fq 'recover_failed_deferred_activation "${old_target}"' "${deploy}"

# 도움말에 지연 배포 옵션이 보여야 함
help=$(bash "${deploy}" --help)
grep -Fq -- '--defer-web' <<< "${help}"
grep -Fq 'activate-web' <<< "${help}"
