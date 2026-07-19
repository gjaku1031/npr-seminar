#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
reset=${repo_root}/ops/pve-release/reset-development-bookings.sh
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
control=${repo_root}/ops/pve-release/google-sheets-control.sh
sheets_reset=${repo_root}/ops/pve-release/google-sheets-reset-development-data.mjs
sheets_reset_wrapper=${repo_root}/ops/pve-release/google-sheets-reset-development-data.sh

bash -n "${reset}" "${deploy}" "${control}" "${sheets_reset_wrapper}"
node --check "${sheets_reset}"

grep -Fq -- '--leave-services-stopped' "${reset}"
grep -Fq 'managed_services+=("${web_service}")' "${reset}"
grep -Fq 'reset_completed=true' "${reset}"
grep -Fq 'database_mutation_committed=true' "${reset}"
grep -Fq 'reset transaction committed but verification failed; application services remain stopped' "${reset}"
for scope in QR_REVOKE QR_ROTATE SURVEY_RESPONSE_SUBMIT BOOKING_ACCESS_EXCHANGE; do
  grep -Fq "'${scope}'" "${reset}"
done

marker_line=$(grep -n 'if ! write_web_deferred_marker "${release}"' "${deploy}" | cut -d: -f1)
start_line=$(grep -n 'if ! start_and_verify_deferred_services' "${deploy}" | cut -d: -f1)
[[ -n ${marker_line} && -n ${start_line} && ${marker_line} -lt ${start_line} ]]
grep -Fq 'recover_failed_deferred_activation "${old_target}"' "${deploy}"
grep -Fq 'NPR_DEPLOY_LOCK_HELD=true' "${deploy}"

grep -Fq 'readonly deploy_lock=/run/lock/npr-seminar-deploy.lock' "${control}"
grep -Fq 'flock -n 8 || die "another NPR deployment or reset is running"' "${control}"
grep -Fq 'flock -n 9 || die "deployment lock inheritance is not held"' "${control}"
grep -Fq 'GOOGLE_SHEETS_PERMISSION_LIST_INCOMPLETE' "${sheets_reset}"
grep -Fq 'GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED' "${sheets_reset_wrapper}"
grep -Fq 'Sheets reset requires a freshly prepared, disabled v4 mapping' "${sheets_reset_wrapper}"

printf 'development reset/deferred deployment safety checks: ok\n'
