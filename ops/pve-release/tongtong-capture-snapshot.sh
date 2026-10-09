#!/usr/bin/env bash
# 통통통 원천에서 세 지점(A·B·C) 재원생 목록을 받아 체크섬이 붙은 스냅숏으로 저장
# 로그인은 하지 않고 tongtong-login-once.sh 가 확인한 세션을 재사용. 요청은 재시도하지 않음
# 실행: pve-release 에서 root 로 인자 없이 실행. 결과 경로를 snapshot=<경로> 로 출력
# 종료 코드: 0 저장 완료, 1 실행 위치·세션 상태·자격 누락 또는 원천 응답 이상(중간에 멈춤)
set -Eeuo pipefail

# pve-release root 에서만 실행
if [[ ${EUID} -ne 0 || $(hostname -s) != "pve-release" ]]; then
  echo "refusing to capture outside pve-release as root" >&2
  exit 1
fi

# 원천 주소·파일 경로와 페이지 크기
base_url=https://www9.hakwonsarang.co.kr
secret_dir=/etc/npr-seminar/secrets
session_dir=/var/lib/npr-seminar/tongtong
cookie_file=${session_dir}/session.cookies
state_file=${session_dir}/auth.state
snapshot_root=${session_dir}/snapshots
page_size=5000

# 확인된 세션(AUTHENTICATED)과 자격 파일이 있어야 함
if [[ ! -s ${cookie_file} || ! -s ${state_file} || $(cut -f1 "${state_file}") != AUTHENTICATED ]]; then
  echo "capture refused: no verified authenticated session" >&2
  exit 1
fi

username=$(<"${secret_dir}/tongtong-username")
password=$(<"${secret_dir}/tongtong-password")
if [[ -z ${username} || -z ${password} ]]; then
  echo "capture refused: secret files are empty" >&2
  exit 1
fi

# 폼 값 퍼센트 인코딩
urlencode() {
  local value=$1
  local output=''
  local char hex index
  LC_ALL=C
  for ((index=0; index<${#value}; index++)); do
    char=${value:index:1}
    case ${char} in
      [a-zA-Z0-9.~_-]) output+=${char} ;;
      *) printf -v hex '%%%02X' "'${char}"; output+=${hex} ;;
    esac
  done
  printf '%s' "${output}"
}

# 임시 작업 디렉터리. 끝나면 이 경로만 지우고 자격 변수를 비움
work_dir=$(mktemp -d /run/tongtong-capture.XXXXXX)
cleanup() {
  case ${work_dir} in
    /run/tongtong-capture.*) rm -rf -- "${work_dir}" ;;
    *) echo "refusing to remove unexpected capture work directory" >&2 ;;
  esac
  unset username password
}
trap cleanup EXIT
umask 0077

# 시각 기반 스냅숏 디렉터리
snapshot_id=$(date +%Y%m%d-%H%M%S)
snapshot_dir=${snapshot_root}/${snapshot_id}
install -d -o root -g npr -m 0750 "${snapshot_root}" "${snapshot_dir}"

# 공통 curl 옵션(재시도 없음, 세션 쿠키 재사용)
curl_common=(
  --silent
  --show-error
  --retry 0
  --connect-timeout 10
  --max-time 60
  --cookie "${cookie_file}"
  --cookie-jar "${cookie_file}"
  --user-agent 'NPR-Student-Sync/1.0'
)

# 한 지점의 학생 목록을 받아 <지점 코드>.json·열 매핑 TSV 로 저장
capture_branch() {
  local branch_name=$1
  local branch_code=$2
  local switch_form=${work_dir}/switch-${branch_code}.form
  local switch_body=${work_dir}/switch-${branch_code}.html
  local switch_headers=${work_dir}/switch-${branch_code}.headers
  local top_body=${work_dir}/top-${branch_code}.html
  local top_utf8=${work_dir}/top-${branch_code}.utf8.html
  local frame_body=${work_dir}/frame-${branch_code}.html
  local frame_utf8=${work_dir}/frame-${branch_code}.utf8.html
  local column_map=${work_dir}/columns-${branch_code}.tsv
  local page_body page_body_raw page_number page_count total_records rows
  local ndjson=${work_dir}/${branch_code}.ndjson
  local student_key name_key class_key teacher_key unit_key school_key grade_key
  local mother_phone_key father_phone_key status_key registration_start_key class_registration_key source_unique_key

  printf 'param=&txtmb_kind=T&txtmb_id=%s&txtmb_pw=%s&gotarget=mmsc&gobrcode=%s' \
    "$(urlencode "${username}")" "$(urlencode "${password}")" "${branch_code}" > "${switch_form}"

  # 상단 프레임의 학원 코드·환영 문구로 현재 세션이 그 지점인지 확인
  verify_branch() {
    top_status=$(curl "${curl_common[@]}" \
      --output "${top_body}" \
      --write-out '%{http_code}' \
      "${base_url}/mmsc/mmsc_top.asp?containeryn=Y") || return 1
    [[ ${top_status} == 200 ]] || return 1
    iconv -f euc-kr -t utf-8 "${top_body}" > "${top_utf8}" 2>/dev/null || return 1
    grep -aFq "학원코드 : ${branch_code}" "${top_utf8}" || return 1
    grep -aFq 'targetranch_proc.asp' "${top_utf8}" || return 1
    grep -aFq '님 환영합니다' "${top_utf8}" || return 1
  }

  # 세션이 이미 그 지점이면 자격이 담긴 지점 전환 폼을 보내지 않음
  if ! verify_branch; then
    if ! switch_status=$(curl "${curl_common[@]}" \
      --request POST \
      --header 'Content-Type: application/x-www-form-urlencoded' \
      --header "Origin: ${base_url}" \
      --header "Referer: ${base_url}/mmsc/mmsc_top.asp?containeryn=Y" \
      --data-binary "@${switch_form}" \
      --dump-header "${switch_headers}" \
      --output "${switch_body}" \
      --write-out '%{http_code}' \
      "${base_url}/mmsc/targetranch_proc.asp"); then
      echo "branch switch transport failed for ${branch_name}; capture stopped without retry" >&2
      exit 1
    fi
    if [[ ${switch_status} != 200 && ${switch_status} != 302 && ${switch_status} != 303 ]]; then
      echo "branch switch returned HTTP ${switch_status} for ${branch_name}; capture stopped without retry" >&2
      exit 1
    fi
    if ! verify_branch; then
      echo "branch verification failed for ${branch_name}; capture stopped without retry" >&2
      exit 1
    fi
  fi

  # 학생 목록 화면에서 열 키(m숫자)와 열 제목 매핑 추출
  if ! frame_status=$(curl "${curl_common[@]}" \
    --request POST \
    --data-urlencode 'selbs_inorout=NN' \
    --data-urlencode 'page=1' \
    --output "${frame_body}" \
    --write-out '%{http_code}' \
    "${base_url}/mmsc/student/st02frame.asp?proctype=R"); then
    echo "column-map fetch failed for ${branch_name}; capture stopped without retry" >&2
    exit 1
  fi
  if [[ ${frame_status} != 200 ]] || ! iconv -f cp949 -t utf-8 "${frame_body}" > "${frame_utf8}" 2>/dev/null; then
    echo "column-map response invalid for ${branch_name}; capture stopped without retry" >&2
    exit 1
  fi
  grep -aoE 'dataIndx:"m[0-9]+"[^}]*' "${frame_utf8}" \
    | sed -E 's/^dataIndx:"([^"]+)", title:"([^"]*)".*/\1\t\2/' > "${column_map}"

  # 제목이 정확히 하나인 필수 열의 키
  column_key() {
    local title=$1
    local matches
    matches=$(awk -F '\t' -v wanted="${title}" '$2 == wanted {print $1}' "${column_map}")
    if [[ $(printf '%s\n' "${matches}" | sed '/^$/d' | wc -l) -ne 1 ]]; then
      echo "required column '${title}' is not unique for ${branch_name}" >&2
      return 1
    fi
    printf '%s' "${matches}"
  }

  # 선택 열의 키. 없으면 빈 값
  optional_column_key() {
    local title=$1
    local matches count
    matches=$(awk -F '\t' -v wanted="${title}" '$2 == wanted {print $1}' "${column_map}")
    count=$(printf '%s\n' "${matches}" | sed '/^$/d' | wc -l)
    if [[ ${count} -gt 1 ]]; then
      echo "optional column '${title}' is not unique for ${branch_name}" >&2
      return 1
    fi
    if [[ ${count} -eq 1 ]]; then
      printf '%s' "${matches}"
    fi
  }

  # 필요한 열 키. 부 연락처 열만 선택
  student_key=$(column_key 학번) || exit 1
  name_key=$(column_key 성명) || exit 1
  class_key=$(column_key 반명) || exit 1
  teacher_key=$(column_key 담임명) || exit 1
  unit_key=$(column_key 학부) || exit 1
  school_key=$(column_key 학교) || exit 1
  grade_key=$(column_key 학년) || exit 1
  mother_phone_key=$(column_key '부모HP(모)') || exit 1
  father_phone_key=$(optional_column_key '부모HP(부)') || exit 1
  status_key=$(column_key 등록구분) || exit 1
  registration_start_key=$(column_key 등록시작일) || exit 1
  class_registration_key=$(column_key 반등록번호) || exit 1
  source_unique_key=$(column_key 고유번호) || exit 1

  # 열 매핑 저장
  cp "${column_map}" "${snapshot_dir}/${branch_code}-columns.tsv"
  chown root:npr "${snapshot_dir}/${branch_code}-columns.tsv"
  chmod 0640 "${snapshot_dir}/${branch_code}-columns.tsv"

  # 페이지별로 받아 한 줄 JSON 으로 정규화해 이어 붙임. 전체 건수가 바뀌거나 100쪽을 넘으면 중단
  : > "${ndjson}"
  page_number=1
  total_records=0
  page_count=1
  while (( page_number <= page_count )); do
    page_body=${work_dir}/students-${branch_code}-${page_number}.json
    page_body_raw=${page_body}.euckr
    if ! page_status=$(curl "${curl_common[@]}" \
      --request POST \
      --data-urlencode 'txtst_name=' \
      --data-urlencode 'txtcl_code=' \
      --data-urlencode 'txtcl_name=' \
      --data-urlencode "pq_curpage=${page_number}" \
      --data-urlencode "pq_rpp=${page_size}" \
      --output "${page_body_raw}" \
      --write-out '%{http_code}' \
      "${base_url}/mmsc/student/st02frame_json.asp?proctype=R&selbs_inorout=NN&page=1"); then
      echo "student fetch transport failed for ${branch_name} page ${page_number}; capture stopped without retry" >&2
      exit 1
    fi
    # 원천은 EUC-KR 이라고 표시하지만 일부 지점에 CP949 확장 문자가 있어 상위 집합인 CP949 로 디코딩
    if ! iconv -f cp949 -t utf-8 "${page_body_raw}" > "${page_body}" 2>/dev/null; then
      echo "student response encoding invalid for ${branch_name} page ${page_number}; capture stopped without retry" >&2
      exit 1
    fi
    if [[ ${page_status} != 200 ]] || ! jq -e \
      --argjson expected_page "${page_number}" \
      '.curPage == $expected_page and (.totalRecords|type) == "number" and (.data|type) == "array"' \
      "${page_body}" >/dev/null 2>&1; then
      echo "student response invalid for ${branch_name} page ${page_number}; capture stopped without retry" >&2
      exit 1
    fi

    if (( page_number == 1 )); then
      total_records=$(jq -r '.totalRecords' "${page_body}")
      page_count=$(( (total_records + page_size - 1) / page_size ))
      (( page_count > 0 )) || page_count=1
      if (( page_count > 100 )); then
        echo "student page guard exceeded for ${branch_name}; capture stopped" >&2
        exit 1
      fi
    elif [[ $(jq -r '.totalRecords' "${page_body}") != "${total_records}" ]]; then
      echo "student count changed during ${branch_name} capture; capture stopped" >&2
      exit 1
    fi

    jq -c --arg branch "${branch_name}" --arg code "${branch_code}" \
      --arg studentKey "${student_key}" --arg nameKey "${name_key}" --arg classKey "${class_key}" \
      --arg teacherKey "${teacher_key}" --arg unitKey "${unit_key}" --arg schoolKey "${school_key}" \
      --arg gradeKey "${grade_key}" --arg motherPhoneKey "${mother_phone_key}" \
      --arg fatherPhoneKey "${father_phone_key}" --arg statusKey "${status_key}" \
      --arg registrationStartKey "${registration_start_key}" \
      --arg classRegistrationKey "${class_registration_key}" --arg sourceUniqueKey "${source_unique_key}" \
      '.data[] | {
        branch:$branch,
        branchCode:$code,
        studentNo:(.[$studentKey] // ""),
        name:(.[$nameKey] // ""),
        className:(.[$classKey] // ""),
        teacherName:(.[$teacherKey] // ""),
        unitName:(.[$unitKey] // ""),
        schoolName:(.[$schoolKey] // ""),
        gradeName:(.[$gradeKey] // ""),
        motherPhone:(.[$motherPhoneKey] // ""),
        fatherPhone:(if $fatherPhoneKey == "" then "" else (.[$fatherPhoneKey] // "") end),
        registrationStartedOn:(.[$registrationStartKey] // ""),
        enrollmentStatus:(.[$statusKey] // ""),
        classRegistrationNo:(.[$classRegistrationKey] // ""),
        sourceUniqueNo:(.[$sourceUniqueKey] // "")
      }' "${page_body}" >> "${ndjson}"

    page_number=$((page_number + 1))
  done

  # 받은 행 수가 전체 건수와 같아야 저장
  rows=$(wc -l < "${ndjson}")
  if [[ ${rows} -ne ${total_records} ]]; then
    echo "student row count mismatch for ${branch_name}: expected ${total_records}, captured ${rows}" >&2
    exit 1
  fi

  jq -s '.' "${ndjson}" > "${snapshot_dir}/${branch_code}.json"
  chown root:npr "${snapshot_dir}/${branch_code}.json"
  chmod 0640 "${snapshot_dir}/${branch_code}.json"
  printf '%s\t%s\t%s\n' "${branch_name}" "${branch_code}" "${rows}" >> "${work_dir}/counts.tsv"
  printf 'captured branch=%s code=%s rows=%s pages=%s\n' "${branch_name}" "${branch_code}" "${rows}" "${page_count}"
}

# 계정 세션을 일부러 재사용하고 로그인 엔드포인트는 부르지 않음. 지점은 순서대로 전환해 받음
capture_branch A SE8A
capture_branch B KG5M
capture_branch C SE9P

# 건수 파일과 체크섬 파일 작성, 권한 고정
cp "${work_dir}/counts.tsv" "${snapshot_dir}/counts.tsv"
chown root:npr "${snapshot_dir}/counts.tsv"
chmod 0640 "${snapshot_dir}/counts.tsv"
(
  cd "${snapshot_dir}"
  sha256sum SE8A.json KG5M.json SE9P.json SE8A-columns.tsv KG5M-columns.tsv SE9P-columns.tsv counts.tsv > SHA256SUMS
)
chown root:npr "${snapshot_dir}/SHA256SUMS"
chmod 0640 "${snapshot_dir}/SHA256SUMS"
chown root:npr "${cookie_file}"
chmod 0640 "${cookie_file}"

printf 'snapshot=%s\n' "${snapshot_dir}"
