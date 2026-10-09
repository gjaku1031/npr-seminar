#!/usr/bin/env bash
# 워커 DB 계정의 Google Sheets 투영용 읽기 권한이 배포 스크립트·마이그레이션에서 정확한지 확인하는 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
migration=${repo_root}/apps/api/prisma/migrations/20260718011000_google_sheets_projection_worker_grants/migration.sql
assignment_migration=${repo_root}/apps/api/prisma/migrations/20260718050000_google_sheets_assignment_worker_grant/migration.sql

# 기대 GRANT 문
readonly exact_projection_grant='GRANT SELECT ON family_bookings, family_booking_students, students, student_class_assignments, booking_events, seminar_sessions TO npr_worker;'
readonly additive_projection_grant='grant select on students, booking_events, seminar_sessions to npr_worker;'
readonly additive_assignment_grant='grant select on student_class_assignments to npr_worker;'

# 각 GRANT 문이 정확히 한 번 있어야 함
bash -n "${deploy}"
[[ $(grep -Fc "${exact_projection_grant}" "${deploy}") -eq 1 ]]
[[ $(grep -Fc "${additive_projection_grant}" "${migration}") -eq 1 ]]
[[ $(grep -Fc "${additive_assignment_grant}" "${assignment_migration}") -eq 1 ]]

# 과도한 권한(전체 테이블·관리자 테이블·쓰기)이 없어야 함
! grep -Eiq 'grant[[:space:]]+(all|select)[[:space:]]+on[[:space:]]+(all[[:space:]]+tables|admin_users|admin_sessions|student_history)' "${migration}"
! grep -Eiq 'grant[[:space:]]+(insert|update|delete)[[:space:]]+on[[:space:]]+(students|booking_events|seminar_sessions)' "${migration}"
! grep -Eiq 'grant[[:space:]]+(insert|update|delete)[[:space:]]+on[[:space:]]+student_class_assignments' "${assignment_migration}"

printf 'Google Sheets worker grant static checks: ok\n'
