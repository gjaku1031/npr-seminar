#!/usr/bin/env bash
set -Eeuo pipefail

backup_root=/srv/backups/postgresql
if [[ ! -d ${backup_root} || $(stat -c '%U:%G' "${backup_root}") != "postgres:postgres" ]]; then
  echo "invalid PostgreSQL backup directory" >&2
  exit 1
fi

stamp=$(date +%Y%m%d-%H%M%S)
work_dir=$(mktemp -d "${backup_root}/.npr-backup.XXXXXX")
cleanup() {
  case ${work_dir} in
    "${backup_root}"/.npr-backup.*) rm -rf -- "${work_dir}" ;;
    *) echo "refusing to remove unexpected work directory" >&2 ;;
  esac
}
trap cleanup EXIT

pg_dump --format=custom --compress=zstd:6 --file="${work_dir}/npr_seminar-${stamp}.dump" npr_seminar
pg_dumpall --globals-only --file="${work_dir}/globals-${stamp}.sql"
gzip -9 "${work_dir}/globals-${stamp}.sql"

(
  cd "${work_dir}"
  sha256sum "npr_seminar-${stamp}.dump" "globals-${stamp}.sql.gz" > "SHA256SUMS-${stamp}"
)

mv "${work_dir}/npr_seminar-${stamp}.dump" "${backup_root}/"
mv "${work_dir}/globals-${stamp}.sql.gz" "${backup_root}/"
mv "${work_dir}/SHA256SUMS-${stamp}" "${backup_root}/"

# The exact backup root is validated above. Keep fourteen daily generations.
find "${backup_root}" -maxdepth 1 -type f \
  \( -name 'npr_seminar-*.dump' -o -name 'globals-*.sql.gz' -o -name 'SHA256SUMS-*' \) \
  -mtime +14 -delete
