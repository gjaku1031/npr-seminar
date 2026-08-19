-- 다음 학기 사전 배정 반(`09-…`)을 대표 반 후보에서 제외한다.
--
-- 무엇이 있었나: 634명의 반이 `09-1M4A` 처럼 표시되고 단위·담임이 전부 비었다.
-- 두 증상은 하나의 원인이다. 대표 반 선택이 반명 오름차순의 첫 번째를 고르는데
-- `"09-…"` 는 숫자 0 때문에 언제나 앞선다 — 규칙이 아니라 정렬 우연이 골랐다.
-- 그리고 `npr_canonical_unit_name('09-1M4A')` 는 어느 갈래에도 걸리지 않아 null 이 되고,
-- 통통통은 개강 전 반에 담임을 아직 붙이지 않으므로 담임도 함께 빈다.
--
-- 배정 행 자체는 그대로 둔다. 원천에 있는 사실이고 9월이 되면 그때의 현재 반이 된다.
-- 바꾸는 것은 "지금 이 학생의 반"을 고르는 규칙뿐이다.
--
-- TypeScript 쪽 짝: src/modules/student-sync/student-classification.ts 의
-- `isFutureTermStudentClass`. 두 정의는 같은 정규식을 쓴다.

create or replace function npr_is_future_term_student_class(value text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select btrim(normalize(value, NFKC)) ~ '^(0[1-9]|1[0-2])-'
$$;

create or replace function npr_is_representative_student_class(value text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select npr_is_allowed_student_assignment_class(value)
     and not npr_is_future_term_student_class(value)
     and npr_student_class_base(value) !~* '(특강|패키지|입시대비|TEST)'
     and not (
       npr_student_class_base(value) = '기하'
       and npr_has_valid_student_schedule_suffix(value)
     )
$$;

-- 이미 틀린 채로 저장된 학생을 지금 되돌린다.
--
-- 다음 동기화를 기다리지 않는 이유: 통통통 계정은 실패 재시도가 0회라 로그인을 가볍게
-- 부를 수 없고, 되돌리는 데 필요한 배정 행은 이미 전부 DB 에 있다.
--
-- 현재 반이 하나도 없는 학생(9월에 처음 등록)은 건드리지 않는다 — 그들에게는 사전 배정이
-- 유일한 사실이고, 없는 반을 지어내는 것보다 그대로 두는 편이 정직하다.
with recovered as (
  select distinct on (s.id)
         s.id student_id,
         a.class_name,
         a.teacher_name
    from students s
    join student_class_assignments a on a.student_id = s.id
   where npr_is_future_term_student_class(s.class_name)
     and a.source_active
     and npr_is_representative_student_class(a.class_name)
   order by s.id,
            -- 정규반을 과학반보다 앞세운다. 대표 반은 학생의 소속을 말하는 자리다.
            (npr_student_class_base(a.class_name) like '과%'
              or npr_student_class_base(a.class_name) ~ '(물리|화학|생명과학|생물|지구과학)') asc,
            a.class_name asc,
            a.class_registration_no asc
)
update students s
   set class_name = recovered.class_name,
       teacher_name = recovered.teacher_name,
       unit_name = npr_canonical_unit_name(recovered.class_name),
       updated_at = now()
  from recovered
 where recovered.student_id = s.id;

-- 현재 반이 하나도 없는 학생(개강 전 신규 등록)을 '반 없음'과 구분한다.
--
-- 이들은 통통통에서 분명히 `재원생`이다. 다만 8월 중 등록해 9월 반에만 배정돼 있어
-- 지금 다니는 반이 없다. 그 상태를 기존 '미분류'로 뭉치면 원인을 매번 다시 찾게 된다.
alter table students drop constraint if exists students_resolution_check;
alter table students add constraint students_resolution_check check (
  class_resolution_status in ('ONE_REGULAR', 'SCIENCE_ONLY', 'AMBIGUOUS_FALLBACK')
  and (
    (class_resolution_status in ('ONE_REGULAR', 'SCIENCE_ONLY') and class_resolution_reason is null)
    or (class_resolution_status = 'AMBIGUOUS_FALLBACK'
        and class_resolution_reason in ('MULTIPLE_REGULAR', 'NO_CLASS', 'FUTURE_TERM_ONLY'))
  )
);

-- 다음 학기 반만 남은 학생을 지금 표시로 옮긴다. 반명은 명단이 이미 쓰는 '비재원생'
-- 표지를 그대로 쓰고, 단위는 `npr_canonical_unit_name('비재원생')` 이 null 이라 저절로 빈다.
update students s
   set class_name = '비재원생',
       teacher_name = null,
       unit_name = null,
       class_resolution_status = 'AMBIGUOUS_FALLBACK',
       class_resolution_reason = 'FUTURE_TERM_ONLY',
       updated_at = now()
 where s.source_active
   and npr_is_future_term_student_class(s.class_name)
   and not exists (
     select 1 from student_class_assignments a
      where a.student_id = s.id
        and a.source_active
        and npr_is_representative_student_class(a.class_name)
   );
