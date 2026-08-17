-- 실제 입장 인원이 예약 인원을 넘을 수 있게 한다.
--
-- 처음에는 attended_count <= seat_count 로 묶어 두었다. "예약하지 않은 사람을 입장시키는
-- 경로를 만들지 않는다"는 뜻이었는데, 현장이 그렇게 돌아가지 않는다: 1명으로 예약하고
-- 두 분이 오거나, 가족이 더 붙어 오는 일이 실제로 생긴다. 그때 게이트가 사실대로 적을 수
-- 없으면 운영자는 숫자를 포기하거나 거짓으로 적게 된다 — 둘 다 집계를 망친다.
--
-- 그래서 상한을 예약 인원이 아니라 **현실적인 한 가족 규모**로 바꾼다. 하한 1은 유지한다:
-- 0명 입장은 입장이 아니라 미입장이고, 그건 attended_count is null 로 이미 표현된다.
-- 상한 20은 숫자패드 오타(1 대신 111)를 막기 위한 것이지 정책이 아니다.
alter table family_bookings
  drop constraint if exists family_bookings_attended_count_range;
alter table family_bookings
  add constraint family_bookings_attended_count_range
  check (
    attended_count is null
    or (attended_count >= 1 and attended_count <= 20)
  );
