#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
capture_script=${repo_root}/ops/pve-release/tongtong-capture-snapshot.sh
work_dir=$(mktemp -d /tmp/npr-tongtong-static.XXXXXX)
cleanup() {
  case ${work_dir} in
    /tmp/npr-tongtong-static.*) rm -rf -- "${work_dir}" ;;
    *) printf 'refusing to remove unexpected fixture directory\n' >&2 ;;
  esac
}
trap cleanup EXIT

column_map=${work_dir}/columns.tsv
cat > "${column_map}" <<'TSV'
m19	학번
m2	부모HP(부)
m41	성명
m7	부모HP(모)
TSV

column_key() {
  local title=$1
  awk -F '\t' -v wanted="${title}" '$2 == wanted {print $1}' "${column_map}"
}

mother_key=$(column_key '부모HP(모)')
father_key=$(column_key '부모HP(부)')
[[ ${mother_key} == m7 && ${father_key} == m2 ]]

cat > "${work_dir}/page.json" <<'JSON'
{"data":[{"m2":"010-2222-2222","m7":"010-1111-1111","m19":"240001","m41":"홍길동"}]}
JSON
jq -c --arg motherPhoneKey "${mother_key}" --arg fatherPhoneKey "${father_key}" '
  .data[] | {
    motherPhone:(.[$motherPhoneKey] // ""),
    fatherPhone:(if $fatherPhoneKey == "" then "" else (.[$fatherPhoneKey] // "") end)
  }
' "${work_dir}/page.json" > "${work_dir}/normalized.json"
jq -e '.motherPhone == "010-1111-1111" and .fatherPhone == "010-2222-2222"' \
  "${work_dir}/normalized.json" >/dev/null

# The father column is optional for backward-compatible snapshots.
jq -c --arg motherPhoneKey "${mother_key}" --arg fatherPhoneKey '' '
  .data[] | {
    motherPhone:(.[$motherPhoneKey] // ""),
    fatherPhone:(if $fatherPhoneKey == "" then "" else (.[$fatherPhoneKey] // "") end)
  }
' "${work_dir}/page.json" | jq -e '.fatherPhone == ""' >/dev/null

grep -Fq "optional_column_key '부모HP(부)'" "${capture_script}"
grep -Fq -- '--arg fatherPhoneKey "${father_phone_key}"' "${capture_script}"
grep -Fq 'fatherPhone:(if $fatherPhoneKey == ""' "${capture_script}"

printf 'tongtong capture static fixture: ok\n'
