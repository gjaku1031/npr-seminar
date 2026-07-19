-- Timetable suffixes such as [토3], [월수], [월수금1], and [E3] identify a
-- real source assignment. Other bracketed management/special-course names
-- remain excluded. These functions mirror the pure application classifier.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

create or replace function npr_has_valid_student_schedule_suffix(value text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  with captured as (
    select btrim(normalize(value, NFKC)) normalized,
           substring(
             btrim(normalize(value, NFKC))
             from E'^[^\\[\\]]+\\[([^\\[\\]]+)\\]$'
           ) suffix
  ), classified as (
    select normalized,
           suffix,
           regexp_replace(suffix, '[0-9]+$', '') weekdays
      from captured
  )
  select position('*' in normalized) = 0
     and suffix is not null
     and (
       suffix ~ '^[Ee][1-9][0-9]?$'
       or (
         suffix ~ '^[월화수목금토일]{1,3}([1-9][0-9]?)?$'
         and char_length(weekdays) = (
           select count(distinct substr(weekdays, character_index, 1))
             from generate_series(1, char_length(weekdays)) character_index
         )
       )
     )
    from classified
$$;

create or replace function npr_student_class_base(value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select case
    when npr_has_valid_student_schedule_suffix(value)
      then btrim(regexp_replace(
        btrim(normalize(value, NFKC)),
        E'\\[[^\\[\\]]+\\]$',
        ''
      ))
    else btrim(normalize(value, NFKC))
  end
$$;

create or replace function npr_is_allowed_student_assignment_class(value text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select btrim(normalize(value, NFKC)) <> ''
     and position('*' in btrim(normalize(value, NFKC))) = 0
     and (
       btrim(normalize(value, NFKC)) !~ E'[\\[\\]]'
       or npr_has_valid_student_schedule_suffix(value)
     )
$$;

create or replace function npr_is_representative_student_class(value text)
returns boolean
language sql
immutable
strict
parallel safe
as $$
  select npr_is_allowed_student_assignment_class(value)
     and npr_student_class_base(value) !~* '(특강|패키지|입시대비|TEST)'
     and not (
       npr_student_class_base(value) = '기하'
       and npr_has_valid_student_schedule_suffix(value)
     )
$$;

create or replace function npr_canonical_unit_name(value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select case
    when npr_student_class_base(value) in ('', '비재원생') then null
    when npr_student_class_base(value) = '과학' then '과학'
    when npr_student_class_base(value) like any(array[
      '과초6%', '과고1%', '과고2%', '과고3%', '과1%', '과2%', '과3%', '과예중1%', '과예고1%'
    ]) then '과학'
    when npr_student_class_base(value) like '예고1%' then '예고1'
    when npr_student_class_base(value) like '예1S%' or npr_student_class_base(value) like '예1영%' then '특목'
    when npr_student_class_base(value) like '예1%' then '예중1'
    when npr_student_class_base(value) like any(array['초6%', '초5%', '중1%', '중2%', '중3%']) then '특목'
    when npr_student_class_base(value) like '초3%' or left(npr_student_class_base(value), 1) in ('4', '5', '6') then '초등'
    when npr_student_class_base(value) like any(array['고1%', '고2%', '고3%']) then '고등'
    when left(npr_student_class_base(value), 1) = '1' then '중등1'
    when left(npr_student_class_base(value), 1) = '2' then '중등2'
    when left(npr_student_class_base(value), 1) = '3' then '중등3'
    else null
  end
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'student_class_assignments'::regclass
       and conname = 'student_assignments_class_check'
  ) then
    raise exception 'student_assignments_class_check must exist before the no-gap replacement';
  end if;
  if exists (
    select 1
      from pg_constraint
     where conrelid = 'student_class_assignments'::regclass
       and conname = 'student_assignments_class_check_v2'
  ) then
    alter table student_class_assignments
      drop constraint student_assignments_class_check_v2;
  end if;
end
$$;

alter table student_class_assignments
  add constraint student_assignments_class_check_v2
  check (npr_is_allowed_student_assignment_class(class_name))
  not valid;

alter table student_class_assignments
  validate constraint student_assignments_class_check_v2;

alter table student_class_assignments
  drop constraint student_assignments_class_check;

alter table student_class_assignments
  rename constraint student_assignments_class_check_v2
  to student_assignments_class_check;

commit;
