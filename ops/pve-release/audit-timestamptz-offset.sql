-- Read-only audit for PrismaPg timestamptz values written while the effective
-- PostgreSQL TimeZone was Asia/Seoul. This file intentionally performs no repair.
-- A value exactly nine hours behind an independent DB-generated anchor is a
-- high-confidence candidate, but it is never by itself authorization to update.

BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_user AS database_user,
       current_setting('TimeZone') AS effective_timezone,
       clock_timestamp() AS observed_at;

SET LOCAL TIME ZONE 'UTC';

-- Persistent database/role settings. Empty output means no matching override.
SELECT COALESCE(database_name.datname, '*') AS database_name,
       COALESCE(role_name.rolname, '*') AS role_name,
       setting
  FROM pg_db_role_setting AS configured
  LEFT JOIN pg_database AS database_name ON database_name.oid = configured.setdatabase
  LEFT JOIN pg_roles AS role_name ON role_name.oid = configured.setrole
 CROSS JOIN LATERAL unnest(configured.setconfig) AS setting
 WHERE lower(setting) LIKE 'timezone=%'
 ORDER BY database_name, role_name;

-- Complete inventory: every application timestamptz column was potentially
-- exposed on Prisma Date writes or reads and must be classified by write path.
SELECT table_name,
       column_name,
       column_default,
       is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND data_type = 'timestamp with time zone'
 ORDER BY table_name, ordinal_position;

-- Family-booking fields have independent booking_events.occurred_at anchors
-- created by PostgreSQL defaults in the same transaction.
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

-- Every idempotency expiry is specified as creation + 24 hours. A 15-hour
-- stored lifetime is the characteristic nine-hour write shift.
SELECT id,
       scope,
       created_at,
       expires_at,
       extract(epoch FROM (expires_at - created_at))::bigint AS lifetime_seconds,
       abs(extract(epoch FROM (expires_at - created_at)) - 54000) <= 30 AS exact_nine_hour_shift
  FROM idempotency_records
 WHERE abs(extract(epoch FROM (expires_at - created_at)) - 54000) <= 30
 ORDER BY id;

-- OTP challenge expiry is deterministically creation + five minutes.
SELECT public_id,
       purpose,
       created_at,
       expires_at,
       extract(epoch FROM (expires_at - created_at))::bigint AS lifetime_seconds,
       abs(extract(epoch FROM (expires_at - created_at)) + 32100) <= 30 AS exact_nine_hour_shift
  FROM otp_challenges
 WHERE abs(extract(epoch FROM (expires_at - created_at)) + 32100) <= 30
 ORDER BY created_at, public_id;

-- Proof expiry is creation + ten minutes, except one-minute ADMIN_OVERRIDE
-- proofs. created_at is the independent DB-default anchor.
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

-- Sheet rows whose encrypted snapshot may contain a shifted bookingCreatedAt.
-- This only identifies deliveries related to high-confidence booking candidates;
-- it does not decrypt payloads or claim that every listed snapshot is wrong.
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
