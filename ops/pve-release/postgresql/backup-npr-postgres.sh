#!/usr/bin/env bash
# PostgreSQL 야간 백업. npr_seminar DB 덤프와 전역 객체(역할 등)를 백업 디렉터리에 저장하고 14일 넘은 세대 삭제
# 실행: npr-postgres-backup.service 가 postgres 계정으로 /usr/local/sbin/backup-npr-postgres 실행
# 종료 코드: 0 성공, 1 백업 디렉터리가 없거나 소유자가 postgres 가 아님, 그 밖은 pg_dump 등 명령 실패
set -Eeuo pipefail

# 백업 디렉터리 소유자 확인
backup_root=/srv/backups/postgresql
if [[ ! -d ${backup_root} || $(stat -c '%U:%G' "${backup_root}") != "postgres:postgres" ]]; then
  echo "invalid PostgreSQL backup directory" >&2
  exit 1
fi

# 같은 디렉터리의 임시 작업 공간. 끝나면 이 경로만 지움
stamp=$(date +%Y%m%d-%H%M%S)
work_dir=$(mktemp -d "${backup_root}/.npr-backup.XXXXXX")
cleanup() {
  case ${work_dir} in
    "${backup_root}"/.npr-backup.*) rm -rf -- "${work_dir}" ;;
    *) echo "refusing to remove unexpected work directory" >&2 ;;
  esac
}
trap cleanup EXIT

# DB 덤프(custom·zstd)와 전역 객체 SQL
pg_dump --format=custom --compress=zstd:6 --file="${work_dir}/npr_seminar-${stamp}.dump" npr_seminar
pg_dumpall --globals-only --file="${work_dir}/globals-${stamp}.sql"
gzip -9 "${work_dir}/globals-${stamp}.sql"

# 체크섬 파일 생성
(
  cd "${work_dir}"
  sha256sum "npr_seminar-${stamp}.dump" "globals-${stamp}.sql.gz" > "SHA256SUMS-${stamp}"
)

# 완성된 파일만 백업 디렉터리로 옮김
mv "${work_dir}/npr_seminar-${stamp}.dump" "${backup_root}/"
mv "${work_dir}/globals-${stamp}.sql.gz" "${backup_root}/"
mv "${work_dir}/SHA256SUMS-${stamp}" "${backup_root}/"

# 위에서 경로를 확인한 백업 디렉터리 안에서 14일 넘은 세대만 지움
find "${backup_root}" -maxdepth 1 -type f \
  \( -name 'npr_seminar-*.dump' -o -name 'globals-*.sql.gz' -o -name 'SHA256SUMS-*' \) \
  -mtime +14 -delete
