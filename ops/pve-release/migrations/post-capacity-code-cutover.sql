-- 지연 계약 단계 전용. 좌석 원장 테이블(session_capacities) 삭제
-- 모든 API·워커 인스턴스가 좌석 원장을 쓰지 않는 릴리스로 바뀌고 상태 검사를 통과한 뒤에만 마이그레이션 계정으로 실행
-- 마이그레이션을 먼저 적용하는 배포에서 옛 프로세스가 도는 동안 테이블이 지워지지 않도록 apps/api/prisma/migrations 밖에 둠
set lock_timeout = '5s';

drop table if exists public.session_capacities;

reset lock_timeout;
