-- check_in_events.result 에 PARTY_SELECTION_REQUIRED 를 허용한다.
--
-- 이 결과는 실패도 입장도 아니다: 2명 예약이 스캔됐고 QR·회차·예약 상태는 모두 유효한데
-- 실제로 몇 분이 왔는지만 아직 모르는 상태다. 예약은 그대로 두고 스캐너가 스태프에게 묻는다.
--
-- 시도는 결과와 무관하게 전부 감사에 남아야 하므로 이 값도 기록 대상이다 — 되묻는 일이
-- 얼마나 자주 일어나는지, 그 뒤에 확정으로 이어졌는지가 게이트 운영의 실제 지표다.
alter table check_in_events
  drop constraint if exists check_in_events_result_check;
alter table check_in_events
  add constraint check_in_events_result_check
  check (result in (
    'CHECKED_IN',
    'PARTY_SELECTION_REQUIRED',
    'ALREADY_CHECKED_IN',
    'CANCELLED',
    'SESSION_MISMATCH',
    'EXPIRED_QR',
    'REVOKED_QR',
    'INVALID_QR',
    'RESERVATION_NOT_FOUND',
    'NOT_AUTHORIZED'
  ));
