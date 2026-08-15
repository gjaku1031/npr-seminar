#!/bin/sh
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
