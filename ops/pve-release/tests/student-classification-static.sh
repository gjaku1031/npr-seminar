#!/usr/bin/env bash
# 학생 반 분류 보고서 도우미 자체 검사와 반 접미사 마이그레이션의 무중단 절차 확인
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
helper=${repo_root}/ops/pve-release/student-classification-report.py
report=${repo_root}/ops/pve-release/generate-ambiguous-class-report.sh
migration=${repo_root}/apps/api/prisma/migrations/20260718021000_student_schedule_suffix_classes/migration.sql

# 분류 도우미 자체 검사. 보고서 스크립트는 도우미만 쓰고 분류 규칙을 따로 두지 않음
PYTHONDONTWRITEBYTECODE=1 python3 "${helper}" --self-test
bash -n "${report}"
grep -Fq 'student-classification-report.py' "${report}"
! grep -Fq 'contains("[")' "${report}"
! grep -Fq 'startswith("과")' "${report}"

# 제약 교체 마이그레이션이 잠금 상한·NOT VALID 추가·검증·이름 변경 순서를 따름
grep -Fq 'begin;' "${migration}"
grep -Fq "set local lock_timeout = '5s';" "${migration}"
grep -Fq 'add constraint student_assignments_class_check_v2' "${migration}"
grep -Fq 'validate constraint student_assignments_class_check_v2' "${migration}"
grep -Fq 'rename constraint student_assignments_class_check_v2' "${migration}"

printf 'student classification parity and no-gap migration static checks: ok\n'
