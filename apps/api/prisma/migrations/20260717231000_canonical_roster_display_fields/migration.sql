-- Canonical operational display values. Staging rows, source snapshots,
-- student_history, and immutable audit events remain untouched.
create or replace function npr_primary_teacher(value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select nullif(btrim(split_part(normalize(value, NFKC), ',', 1)), '')
$$;

create or replace function npr_canonical_unit_name(value text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select case
    when btrim(normalize(value, NFKC)) in ('', '비재원생') then null
    when btrim(normalize(value, NFKC)) = '과학' then '과학'
    when btrim(normalize(value, NFKC)) like any(array[
      '과초6%', '과고1%', '과고2%', '과고3%', '과1%', '과2%', '과3%', '과예중1%', '과예고1%'
    ]) then '과학'
    when btrim(normalize(value, NFKC)) like '예고1%' then '예고1'
    when btrim(normalize(value, NFKC)) like '예1S%' or btrim(normalize(value, NFKC)) like '예1영%' then '특목'
    when btrim(normalize(value, NFKC)) like '예1%' then '예중1'
    when btrim(normalize(value, NFKC)) like any(array['초6%', '초5%', '중1%', '중2%', '중3%']) then '특목'
    when btrim(normalize(value, NFKC)) like '초3%' or left(btrim(normalize(value, NFKC)), 1) in ('4', '5', '6') then '초등'
    when btrim(normalize(value, NFKC)) like any(array['고1%', '고2%', '고3%']) then '고등'
    when left(btrim(normalize(value, NFKC)), 1) = '1' then '중등1'
    when left(btrim(normalize(value, NFKC)), 1) = '2' then '중등2'
    when left(btrim(normalize(value, NFKC)), 1) = '3' then '중등3'
    else null
  end
$$;

update students
set teacher_name=npr_primary_teacher(teacher_name),
    unit_name=npr_canonical_unit_name(class_name)
where teacher_name is distinct from npr_primary_teacher(teacher_name)
   or unit_name is distinct from npr_canonical_unit_name(class_name);

update student_class_assignments
set teacher_name=npr_primary_teacher(teacher_name),
    unit_name=npr_canonical_unit_name(class_name)
where teacher_name is distinct from npr_primary_teacher(teacher_name)
   or unit_name is distinct from npr_canonical_unit_name(class_name);

update family_booking_students
set teacher_name_snapshot=npr_primary_teacher(teacher_name_snapshot),
    unit_name_snapshot=npr_canonical_unit_name(class_name_snapshot)
where teacher_name_snapshot is distinct from npr_primary_teacher(teacher_name_snapshot)
   or unit_name_snapshot is distinct from npr_canonical_unit_name(class_name_snapshot);
