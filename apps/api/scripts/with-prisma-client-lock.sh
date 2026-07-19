#!/usr/bin/env bash
set -euo pipefail

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
api_directory=$(cd -- "${script_directory}/.." && pwd -P)
schema_path="${api_directory}/prisma/schema.prisma"
prisma_cli="${api_directory}/node_modules/.bin/prisma"

[[ -r ${schema_path} ]] || {
  echo "Prisma schema is not readable: ${schema_path}" >&2
  exit 1
}
[[ -x ${prisma_cli} ]] || {
  echo "Prisma CLI is not installed: ${prisma_cli}" >&2
  exit 1
}
command -v flock >/dev/null 2>&1 || {
  echo "flock is required to serialize Prisma client generation" >&2
  exit 1
}

# Keep this descriptor open through the wrapped command. Every API task locks
# the same stable inode, so no generator can replace the client while another
# compiler or test process is reading it. No temporary lock file is required.
exec 9<"${schema_path}"
flock --exclusive 9

cd -- "${api_directory}"
"${prisma_cli}" generate

if (( $# > 0 )); then
  exec "$@"
fi
