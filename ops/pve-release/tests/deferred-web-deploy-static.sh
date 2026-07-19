#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh

bash -n "${deploy}"

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
grep -Fq 'configure_and_verify_tailscale_funnel' "${deploy}"
grep -Fq 'recover_failed_deferred_activation "${old_target}"' "${deploy}"

help=$(bash "${deploy}" --help)
grep -Fq -- '--defer-web' <<< "${help}"
grep -Fq 'activate-web' <<< "${help}"
