-- 실제 입장 인원과 테스트 예약 표시.
--
-- attended_count: 게이트에서 확정한 **실제 입장 학부모 수**. 예약 인원(seat_count)과 다를 수
--   있다 — 2명 예약에 한 분만 오는 경우가 있어 스캐너가 묻고 스태프가 고른다.
--   미입장이면 null 이다. 이 제품에 좌석 개념은 없다: 세는 단위는 사람 수뿐이다.
--
-- is_test: QR 재테스트 전용 예약. 통계·Google Sheets 투영·일반 문자 대상에서 제외되고
--   예약 명단 맨 앞에 고정된다. 입장 취소도 이 예약에만 허용한다.
alter table family_bookings
  add column if not exists attended_count integer,
  add column if not exists is_test boolean not null default false;

-- 입장한 예약은 인원이 1 이상이고 예약 인원을 넘을 수 없다. 미입장이면 인원도 없다.
alter table family_bookings
  drop constraint if exists family_bookings_attended_count_range;
alter table family_bookings
  add constraint family_bookings_attended_count_range
  check (
    attended_count is null
    or (attended_count >= 1 and attended_count <= seat_count)
  );

-- 기존 입장 완료 건은 예약 인원 그대로 들어온 것으로 본다. 이 값 없이는 명단이
-- "입장했지만 몇 명인지 모름"을 그려야 하는데, 도입 전 입장은 전원 입장이 사실이다.
update family_bookings
   set attended_count = seat_count
 where status = 'CHECKED_IN'
   and attended_count is null;

-- 명단은 테스트 예약을 맨 앞에 고정하고, 문자 '테스트 계정' 대상도 이 열로 고른다.
create index if not exists family_bookings_session_test_idx
  on family_bookings (session_id, is_test);
