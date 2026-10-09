#!/usr/bin/env bash
# 통통통 정규 스냅숏으로 대표 반 판정 불가 학생 보고서(TSV)와 요약(JSON) 생성
# 실행: pve-release 에서 root 로 generate-ambiguous-class-report.sh <스냅숏 디렉터리>
#   스냅숏은 /var/lib/npr-seminar/tongtong/snapshots 아래여야 하고 SHA256SUMS 검증을 통과해야 함
# 종료 코드: 0 생성 완료, 1 실행 위치·스냅숏 경로·파일 누락, 그 밖은 체크섬·도우미 실패
set -Eeuo pipefail

# 분류 규칙은 도우미 한 곳에만 둠
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
classification_report=${script_dir}/student-classification-report.py

# pve-release root 에서만 실행
if [[ ${EUID} -ne 0 || $(hostname -s) != "pve-release" ]]; then
  echo "refusing to generate the report outside pve-release as root" >&2
  exit 1
fi

# 보호된 스냅숏 경로와 파일·체크섬 확인
snapshot_dir=${1:?canonical snapshot directory is required}
case ${snapshot_dir} in
  /var/lib/npr-seminar/tongtong/snapshots/*) ;;
  *) echo "snapshot must be below the protected TongTongTong snapshot root" >&2; exit 1 ;;
esac

for source_file in SE8A.json KG5M.json SE9P.json SHA256SUMS; do
  [[ -f ${snapshot_dir}/${source_file} ]] || {
    echo "missing canonical snapshot file: ${source_file}" >&2
    exit 1
  }
done

(
  cd "${snapshot_dir}"
  sha256sum --check --status SHA256SUMS
)

# 출력 경로와 임시 작업 디렉터리. 끝나면 이 경로만 지움
report_root=/var/lib/npr-seminar/tongtong/reports
snapshot_id=$(basename "${snapshot_dir}")
report_file=${report_root}/${snapshot_id}-ambiguous-class-resolution.tsv
summary_file=${report_root}/${snapshot_id}-ambiguous-class-summary.json
work_dir=$(mktemp -d /run/npr-class-report.XXXXXX)

cleanup() {
  case ${work_dir} in
    /run/npr-class-report.*) rm -rf -- "${work_dir}" ;;
    *) echo "refusing to remove unexpected report work directory" >&2 ;;
  esac
}
trap cleanup EXIT

install -d -o root -g npr -m 0750 "${report_root}"

# 도우미로 판정 불가 행·요약 생성
[[ -f ${classification_report} ]] || {
  echo "missing student classification report helper" >&2
  exit 1
}
python3 "${classification_report}" \
  "${work_dir}/rows.tsv" \
  "${work_dir}/summary.json" \
  "${snapshot_dir}/SE8A.json" \
  "${snapshot_dir}/KG5M.json" \
  "${snapshot_dir}/SE9P.json"

# 머리글을 붙이고 사유·지점·학번 순으로 정렬
{
  printf 'reason\tbranch_code\tstudent_no\tstudent_name\tall_assignments\tregular_class_candidates\tscience_assignments\tsupplementary_assignments\n'
  sort -t $'\t' -k1,1 -k2,2 -k3,3 "${work_dir}/rows.tsv"
} > "${work_dir}/report.tsv"

# 판정 불가 학생 수 합계
multiple_regular_count=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["multipleRegularClasses"])' "${work_dir}/summary.json")
no_class_count=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["noRegularOrScienceClass"])' "${work_dir}/summary.json")
total_count=$((multiple_regular_count + no_class_count))

# 요약에 스냅숏 ID 추가
python3 -c '
import json,sys
path,snapshot_id=sys.argv[1:]
value=json.load(open(path,encoding="utf-8"))
value={"snapshotId":snapshot_id,**value}
open(path,"w",encoding="utf-8").write(json.dumps(value,ensure_ascii=False,separators=(",",":"))+"\n")
' "${work_dir}/summary.json" "${snapshot_id}"

# 결과를 root:npr 0640 으로 설치
install -o root -g npr -m 0640 "${work_dir}/report.tsv" "${report_file}"
install -o root -g npr -m 0640 "${work_dir}/summary.json" "${summary_file}"

printf 'report=%s\nsummary=%s\nambiguous_students=%s\n' \
  "${report_file}" "${summary_file}" "${total_count}"
