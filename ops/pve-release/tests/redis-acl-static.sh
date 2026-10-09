#!/usr/bin/env bash
# 앱용 Redis ACL 이 필요한 명령만 허용하는지 확인하는 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
installer=${repo_root}/ops/pve-release/install-datastores.sh
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh

bash -n "${installer}" "${deploy}"

# 허용 명령 목록과 넓은 범주 권한 금지
expected_acl="user npr on >%s ~npr:* +@connection +get +set +del +exists +incr +expire +ttl +sadd +smembers +eval"
grep -Fq "${expected_acl}" "${installer}"
! grep -Eq 'user npr on .*\+@(read|write|keyspace|dangerous)' "${installer}"

# 설치·배포 스크립트가 허용 명령을 실제로 점검함
for command in GET SET DEL INCR EXPIRE TTL SADD SMEMBERS EVAL; do
  grep -Fq "redis_app_cli ${command}" "${installer}"
done
grep -Fq "redis.call('EXISTS',KEYS[1])" "${installer}"
grep -Fq 'const evalReply = await client.eval(' "${deploy}"
grep -Fq 'reply !== "PONG" || evalReply !== "verified"' "${deploy}"

printf 'redis ACL static checks: ok\n'
