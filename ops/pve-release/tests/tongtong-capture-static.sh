#!/usr/bin/env bash
# 통통통 스냅숏 캡처의 연락처 열 매핑(부 연락처 열은 선택)을 fixture 로 확인하는 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
capture_script=${repo_root}/ops/pve-release/tongtong-capture-snapshot.sh
# 임시 디렉터리. 끝나면 이 경로만 지움
work_dir=$(mktemp -d /tmp/npr-tongtong-static.XXXXXX)
cleanup() {
  case ${work_dir} in
    /tmp/npr-tongtong-static.*) rm -rf -- "${work_dir}" ;;
    *) printf 'refusing to remove unexpected fixture directory\n' >&2 ;;
  esac
}
trap cleanup EXIT

# 열 제목 → 열 키 매핑 fixture
column_map=${work_dir}/columns.tsv
cat > "${column_map}" <<'TSV'
m19	학번
m2	부모HP(부)
m41	성명
m7	부모HP(모)
TSV

# 열 제목으로 열 키 찾기
column_key() {
  local title=$1
  awk -F '\t' -v wanted="${title}" '$2 == wanted {print $1}' "${column_map}"
}

mother_key=$(column_key '부모HP(모)')
father_key=$(column_key '부모HP(부)')
[[ ${mother_key} == m7 && ${father_key} == m2 ]]

# 모·부 연락처 열이 모두 있을 때 정규화 결과
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

# 부 연락처 열이 없는 이전 스냅숏도 처리함
jq -c --arg motherPhoneKey "${mother_key}" --arg fatherPhoneKey '' '
  .data[] | {
    motherPhone:(.[$motherPhoneKey] // ""),
    fatherPhone:(if $fatherPhoneKey == "" then "" else (.[$fatherPhoneKey] // "") end)
  }
' "${work_dir}/page.json" | jq -e '.fatherPhone == ""' >/dev/null

# 캡처 스크립트가 같은 jq 정규화를 씀
grep -Fq "optional_column_key '부모HP(부)'" "${capture_script}"
grep -Fq -- '--arg fatherPhoneKey "${father_phone_key}"' "${capture_script}"
grep -Fq 'fatherPhone:(if $fatherPhoneKey == ""' "${capture_script}"

printf 'tongtong capture static fixture: ok\n'
