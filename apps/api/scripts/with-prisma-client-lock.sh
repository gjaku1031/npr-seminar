#!/usr/bin/env bash
# Prisma 클라이언트 생성을 직렬화한 뒤 지정 명령 실행
# 사용: bash scripts/with-prisma-client-lock.sh [명령 인자...]. 인자가 없으면 생성만 수행
# package.json의 build·typecheck·lint·test가 이 스크립트를 거쳐 실행됨
# 종료 코드: 1 스키마 읽기 불가·Prisma CLI 없음·flock 없음, 그 외는 prisma generate 또는 지정 명령의 종료 코드
set -euo pipefail

# 경로 계산
script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
api_directory=$(cd -- "${script_directory}/.." && pwd -P)
schema_path="${api_directory}/prisma/schema.prisma"
prisma_cli="${api_directory}/node_modules/.bin/prisma"

# 실행 전제 확인
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

# 감싼 명령이 끝날 때까지 이 디스크립터를 열어 둠
# 모든 API 작업이 같은 inode(스키마 파일)를 잠가, 다른 컴파일·테스트가 읽는 중에 생성기가 클라이언트를 교체하지 못하게 함
# 별도 임시 잠금 파일은 필요 없음
exec 9<"${schema_path}"
flock --exclusive 9

# 클라이언트 생성 후 지정 명령으로 교체 실행
cd -- "${api_directory}"
"${prisma_cli}" generate

if (( $# > 0 )); then
  exec "$@"
fi
