#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
migration=${repo_root}/apps/api/prisma/migrations/20260718011000_google_sheets_projection_worker_grants/migration.sql
assignment_migration=${repo_root}/apps/api/prisma/migrations/20260718050000_google_sheets_assignment_worker_grant/migration.sql

readonly exact_projection_grant='GRANT SELECT ON family_bookings, family_booking_students, students, student_class_assignments, booking_events, seminar_sessions TO npr_worker;'
readonly additive_projection_grant='grant select on students, booking_events, seminar_sessions to npr_worker;'
readonly additive_assignment_grant='grant select on student_class_assignments to npr_worker;'

bash -n "${deploy}"
[[ $(grep -Fc "${exact_projection_grant}" "${deploy}") -eq 1 ]]
[[ $(grep -Fc "${additive_projection_grant}" "${migration}") -eq 1 ]]
[[ $(grep -Fc "${additive_assignment_grant}" "${assignment_migration}") -eq 1 ]]

! grep -Eiq 'grant[[:space:]]+(all|select)[[:space:]]+on[[:space:]]+(all[[:space:]]+tables|admin_users|admin_sessions|student_history)' "${migration}"
! grep -Eiq 'grant[[:space:]]+(insert|update|delete)[[:space:]]+on[[:space:]]+(students|booking_events|seminar_sessions)' "${migration}"
! grep -Eiq 'grant[[:space:]]+(insert|update|delete)[[:space:]]+on[[:space:]]+student_class_assignments' "${assignment_migration}"

printf 'Google Sheets worker grant static checks: ok\n'
