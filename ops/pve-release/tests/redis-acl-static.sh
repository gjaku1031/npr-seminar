#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
installer=${repo_root}/ops/pve-release/install-datastores.sh
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh

bash -n "${installer}" "${deploy}"

expected_acl="user npr on >%s ~npr:* +@connection +get +set +del +exists +incr +expire +ttl +sadd +smembers +eval"
grep -Fq "${expected_acl}" "${installer}"
! grep -Eq 'user npr on .*\+@(read|write|keyspace|dangerous)' "${installer}"

for command in GET SET DEL INCR EXPIRE TTL SADD SMEMBERS EVAL; do
  grep -Fq "redis_app_cli ${command}" "${installer}"
done
grep -Fq "redis.call('EXISTS',KEYS[1])" "${installer}"
grep -Fq 'const evalReply = await client.eval(' "${deploy}"
grep -Fq 'reply !== "PONG" || evalReply !== "verified"' "${deploy}"

printf 'redis ACL static checks: ok\n'
