#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
control=${repo_root}/ops/pve-release/tong-sync-control.sh
contract=${repo_root}/ops/pve-release/tong-wire-contract.production.json
work_dir=$(mktemp -d /tmp/npr-tong-env.XXXXXX)
cleanup() {
  case ${work_dir} in /tmp/npr-tong-env.*) rm -rf -- "${work_dir}" ;; esac
}
trap cleanup EXIT

bash -n "${deploy}" "${control}"
[[ -x ${control} ]]
[[ $(wc -l < "${contract}") -eq 1 ]]
! grep -q "'" "${contract}"

wire=$(<"${contract}")
fixture=${work_dir}/api.env
printf '%s\n' \
  "TONG_SYNC_ENABLED='false'" \
  "TONG_WIRE_CONTRACT_CONFIRMED='false'" \
  "TONG_WIRE_CONTRACT_JSON='${wire}'" \
  "TONG_BASE_URL='https://www9.hakwonsarang.co.kr'" \
  "TONG_USERNAME='fixture-user'" \
  "TONG_PASSWORD='fixture-password'" > "${fixture}"

TONG_ENV_FIXTURE=${fixture} node -e '
  const fs = require("node:fs");
  const lines = fs.readFileSync(process.env.TONG_ENV_FIXTURE, "utf8").trimEnd().split("\n");
  const values = Object.fromEntries(lines.map((line) => {
    const match = /^([A-Z][A-Z0-9_]*)=\x27([^\x27]*)\x27$/.exec(line);
    if (!match) process.exit(1);
    return [match[1], match[2]];
  }));
  const wire = JSON.parse(values.TONG_WIRE_CONTRACT_JSON);
  if (values.TONG_SYNC_ENABLED !== "false" || values.TONG_WIRE_CONTRACT_CONFIRMED !== "false") process.exit(1);
  if (values.TONG_BASE_URL !== "https://www9.hakwonsarang.co.kr") process.exit(1);
  if (wire.login.securityPath !== "/mmsc/Login_security_Proc.asp") process.exit(1);
  if (wire.students.filterValue !== "NN" || wire.students.pageSize !== 5000) process.exit(1);
'

for forbidden in worker_env web_env migration_env; do
  grep -q "forbid_env_key \"\${${forbidden}}\"" "${deploy}"
done
grep -Fq "'TONG_SYNC_ENABLED=false'" "${deploy}"
grep -Fq "'TONG_WIRE_CONTRACT_CONFIRMED=false'" "${deploy}"
grep -Fq 'enabled=$(env_value "${api_env}" TONG_SYNC_ENABLED)' "${deploy}"
grep -Fq 'confirmed=$(env_value "${api_env}" TONG_WIRE_CONTRACT_CONFIRMED)' "${deploy}"
! grep -Fq 'queue_env_value TONG_SYNC_ENABLED false' "${deploy}"
grep -Fq 'readonly runtime_env=/etc/npr-seminar/runtime.env' "${control}"
grep -Fq 'mv -fT -- "${runtime_temp}" "${runtime_env}"' "${control}"
grep -Fq 'mv -fT -- "${api_temp}" "${api_env}"' "${control}"
grep -Fq 'flock -n 8 || die "an NPR deployment is active"' "${control}"
grep -Fq 'systemctl restart "${service}"' "${control}"
printf 'tong sync environment static checks: ok\n'
