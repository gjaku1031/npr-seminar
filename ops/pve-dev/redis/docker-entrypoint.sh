#!/bin/sh
# QA Redis 컨테이너 시작 스크립트. REDIS_PASSWORD 로 ACL 파일을 만들고 redis-server 실행
# compose.yaml 의 entrypoint 로 실행. 종료 코드 1: 비밀번호가 비었거나 영숫자가 아님
set -eu

case "${REDIS_PASSWORD:-}" in
  ""|*[!A-Za-z0-9]*)
    echo "REDIS_PASSWORD must be non-empty ASCII alphanumeric text" >&2
    exit 1
    ;;
esac

umask 077
cat > /run/redis/users.acl <<EOF
user default off
user npr_qa on >${REDIS_PASSWORD} ~npr:staging:* +@all -@dangerous
EOF
unset REDIS_PASSWORD
exec redis-server /usr/local/etc/redis/qa.conf
