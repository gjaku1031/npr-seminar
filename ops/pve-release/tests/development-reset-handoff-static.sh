#!/usr/bin/env bash
# 개발용 예약 초기화와 지연 배포가 서로 안전하게 넘겨받는지 확인하는 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
reset=${repo_root}/ops/pve-release/reset-development-bookings.sh
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
control=${repo_root}/ops/pve-release/google-sheets-control.sh
sheets_reset=${repo_root}/ops/pve-release/google-sheets-reset-development-data.mjs
sheets_reset_wrapper=${repo_root}/ops/pve-release/google-sheets-reset-development-data.sh

# 대상 스크립트 문법
bash -n "${reset}" "${deploy}" "${control}" "${sheets_reset_wrapper}"
node --check "${sheets_reset}"

# 초기화 스크립트의 서비스 정지·완료 표식·검증 실패 처리와 초기화 대상 범위
grep -Fq -- '--leave-services-stopped' "${reset}"
grep -Fq 'managed_services+=("${web_service}")' "${reset}"
grep -Fq 'reset_completed=true' "${reset}"
grep -Fq 'database_mutation_committed=true' "${reset}"
grep -Fq 'reset transaction committed but verification failed; application services remain stopped' "${reset}"
! grep -Fq 'session_capacities' "${reset}"
grep -Fq "'activeFamilyBookings'" "${reset}"
grep -Fq "'checkedInAttendees'" "${reset}"
for scope in QR_REVOKE QR_ROTATE SURVEY_RESPONSE_SUBMIT BOOKING_ACCESS_EXCHANGE; do
  grep -Fq "'${scope}'" "${reset}"
done

# 지연 표식을 서비스 시작보다 먼저 써야 실패 시 복구할 수 있음
marker_line=$(grep -n 'if ! write_web_deferred_marker "${release}"' "${deploy}" | cut -d: -f1)
start_line=$(grep -n 'if ! start_and_verify_deferred_services' "${deploy}" | cut -d: -f1)
[[ -n ${marker_line} && -n ${start_line} && ${marker_line} -lt ${start_line} ]]
grep -Fq 'recover_failed_deferred_activation "${old_target}"' "${deploy}"
grep -Fq 'NPR_DEPLOY_LOCK_HELD=true' "${deploy}"

# 시트 제어 스크립트의 배포 잠금과 시트 초기화 안전 조건
grep -Fq 'readonly deploy_lock=/run/lock/npr-seminar-deploy.lock' "${control}"
grep -Fq 'flock -n 8 || die "another NPR deployment or reset is running"' "${control}"
grep -Fq 'flock -n 9 || die "deployment lock inheritance is not held"' "${control}"
grep -Fq 'GOOGLE_SHEETS_PERMISSION_LIST_INCOMPLETE' "${sheets_reset}"
grep -Fq 'GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED' "${sheets_reset_wrapper}"
grep -Fq 'Sheets reset requires a freshly prepared, disabled v4 mapping' "${sheets_reset_wrapper}"

printf 'development reset/deferred deployment safety checks: ok\n'
