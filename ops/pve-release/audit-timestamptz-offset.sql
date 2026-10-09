-- PostgreSQL 실효 TimeZone 이 Asia/Seoul 이던 동안 PrismaPg 가 쓴 timestamptz 값의 읽기 전용 감사. 수정은 하지 않음
-- 실행: psql 로 이 파일 실행(읽기 전용 트랜잭션). 결과는 후보 목록일 뿐임
-- DB 가 따로 만든 기준 시각보다 정확히 9시간 이른 값은 신뢰도 높은 후보지만, 그것만으로 수정 근거가 되지 않음

BEGIN TRANSACTION READ ONLY;

-- 접속 정보와 현재 세션 시간대
SELECT current_database() AS database_name,
       current_user AS database_user,
       current_setting('TimeZone') AS effective_timezone,
       clock_timestamp() AS observed_at;

SET LOCAL TIME ZONE 'UTC';

-- DB·역할 단위로 저장된 시간대 설정. 결과가 없으면 덮어쓴 설정 없음
SELECT COALESCE(database_name.datname, '*') AS database_name,
       COALESCE(role_name.rolname, '*') AS role_name,
       setting
  FROM pg_db_role_setting AS configured
  LEFT JOIN pg_database AS database_name ON database_name.oid = configured.setdatabase
  LEFT JOIN pg_roles AS role_name ON role_name.oid = configured.setrole
 CROSS JOIN LATERAL unnest(configured.setconfig) AS setting
 WHERE lower(setting) LIKE 'timezone=%'
 ORDER BY database_name, role_name;

-- 전체 목록. 앱의 모든 timestamptz 열이 Prisma Date 읽기·쓰기로 영향받을 수 있으므로 쓰기 경로별로 분류해야 함
SELECT table_name,
       column_name,
       column_default,
       is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND data_type = 'timestamp with time zone'
 ORDER BY table_name, ordinal_position;

-- 가족 예약 시각 필드는 같은 트랜잭션에서 PostgreSQL 기본값으로 생성된 booking_events.occurred_at 을 독립 기준으로 삼음
WITH anchored AS (
  SELECT booking.public_id,
         'created_at'::text AS field_name,
         booking.created_at AS stored_at,
         MIN(event.occurred_at) FILTER (WHERE event.event_type = 'CREATED') AS anchor_at
    FROM family_bookings AS booking
    JOIN booking_events AS event ON event.family_booking_id = booking.id
   GROUP BY booking.id
  UNION ALL
  SELECT booking.public_id,
         'checked_in_at',
         booking.checked_in_at,
         MIN(event.occurred_at) FILTER (WHERE event.event_type = 'CHECKED_IN')
    FROM family_bookings AS booking
    JOIN booking_events AS event ON event.family_booking_id = booking.id
   WHERE booking.checked_in_at IS NOT NULL
   GROUP BY booking.id
  UNION ALL
  SELECT booking.public_id,
         'cancelled_at',
         booking.cancelled_at,
         MIN(event.occurred_at) FILTER (WHERE event.event_type = 'CANCELLED')
    FROM family_bookings AS booking
    JOIN booking_events AS event ON event.family_booking_id = booking.id
   WHERE booking.cancelled_at IS NOT NULL
   GROUP BY booking.id
), measured AS (
  SELECT public_id,
         field_name,
         stored_at,
         anchor_at,
         extract(epoch FROM (stored_at - anchor_at))::bigint AS offset_seconds
    FROM anchored
   WHERE stored_at IS NOT NULL AND anchor_at IS NOT NULL
)
SELECT public_id,
       field_name,
       stored_at,
       anchor_at,
       offset_seconds,
       abs(offset_seconds + 32400) <= 5 AS exact_nine_hours_behind
  FROM measured
 WHERE abs(offset_seconds + 32400) <= 5
 ORDER BY anchor_at, public_id, field_name;

-- 멱등 기록 만료는 생성 + 24시간. 저장된 수명이 15시간이면 9시간 쓰기 밀림의 특징임
SELECT id,
       scope,
       created_at,
       expires_at,
       extract(epoch FROM (expires_at - created_at))::bigint AS lifetime_seconds,
       abs(extract(epoch FROM (expires_at - created_at)) - 54000) <= 30 AS exact_nine_hour_shift
  FROM idempotency_records
 WHERE abs(extract(epoch FROM (expires_at - created_at)) - 54000) <= 30
 ORDER BY id;

-- OTP 챌린지 만료는 항상 생성 + 5분
SELECT public_id,
       purpose,
       created_at,
       expires_at,
       extract(epoch FROM (expires_at - created_at))::bigint AS lifetime_seconds,
       abs(extract(epoch FROM (expires_at - created_at)) + 32100) <= 30 AS exact_nine_hour_shift
  FROM otp_challenges
 WHERE abs(extract(epoch FROM (expires_at - created_at)) + 32100) <= 30
 ORDER BY created_at, public_id;

-- 증명 만료는 생성 + 10분(ADMIN_OVERRIDE 만 1분). created_at 은 DB 기본값으로 만든 독립 기준
WITH proof_lifetimes AS (
  SELECT public_id,
         purpose,
         created_at,
         expires_at,
         CASE WHEN purpose = 'ADMIN_OVERRIDE' THEN 60 ELSE 600 END AS expected_seconds
    FROM otp_proof_audits
), measured AS (
  SELECT *, extract(epoch FROM (expires_at - created_at))::bigint AS lifetime_seconds
    FROM proof_lifetimes
)
SELECT public_id,
       purpose,
       created_at,
       expires_at,
       lifetime_seconds,
       expected_seconds,
       abs(lifetime_seconds - (expected_seconds - 32400)) <= 30 AS exact_nine_hour_shift
  FROM measured
 WHERE abs(lifetime_seconds - (expected_seconds - 32400)) <= 30
 ORDER BY created_at, public_id;

-- 암호화 스냅숏에 밀린 bookingCreatedAt 이 들어 있을 수 있는 시트 발송 행
-- 신뢰도 높은 예약 후보와 관련된 발송만 찾음. 내용을 복호화하지 않고, 목록의 모든 스냅숏이 틀렸다고 단정하지 않음
WITH candidate_bookings AS (
  SELECT booking.public_id
    FROM family_bookings AS booking
    JOIN booking_events AS event
      ON event.family_booking_id = booking.id
     AND event.event_type = 'CREATED'
   GROUP BY booking.id
  HAVING abs(extract(epoch FROM (booking.created_at - MIN(event.occurred_at))) + 32400) <= 5
)
SELECT delivery.delivery_public_id,
       delivery.family_booking_public_id,
       delivery.event_type,
       delivery.status,
       delivery.created_at
  FROM sheet_outbox AS delivery
  JOIN candidate_bookings AS booking
    ON booking.public_id = delivery.family_booking_public_id
 ORDER BY delivery.created_at, delivery.delivery_public_id;

COMMIT;
