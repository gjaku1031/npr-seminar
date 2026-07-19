#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
helper=${repo_root}/ops/pve-release/student-classification-report.py
report=${repo_root}/ops/pve-release/generate-ambiguous-class-report.sh
migration=${repo_root}/apps/api/prisma/migrations/20260718021000_student_schedule_suffix_classes/migration.sql

PYTHONDONTWRITEBYTECODE=1 python3 "${helper}" --self-test
bash -n "${report}"
grep -Fq 'student-classification-report.py' "${report}"
! grep -Fq 'contains("[")' "${report}"
! grep -Fq 'startswith("과")' "${report}"

grep -Fq 'begin;' "${migration}"
grep -Fq "set local lock_timeout = '5s';" "${migration}"
grep -Fq 'add constraint student_assignments_class_check_v2' "${migration}"
grep -Fq 'validate constraint student_assignments_class_check_v2' "${migration}"
grep -Fq 'rename constraint student_assignments_class_check_v2' "${migration}"

printf 'student classification parity and no-gap migration static checks: ok\n'
