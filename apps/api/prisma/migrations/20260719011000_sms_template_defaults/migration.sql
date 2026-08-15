ALTER TABLE "sms_templates"
  ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sms_templates" DROP CONSTRAINT "sms_templates_purpose_check";
ALTER TABLE "sms_templates"
  ADD CONSTRAINT "sms_templates_purpose_check"
  CHECK (purpose IN ('OTP','BOOKING_CONFIRMED','BOOKING_UPDATED','BOOKING_CANCELLED','FIRST_CHECK_IN','ADMIN_GROUP','SURVEY'));

ALTER TABLE "sms_outbox" DROP CONSTRAINT "sms_outbox_source_check";
ALTER TABLE "sms_outbox"
  ADD CONSTRAINT "sms_outbox_source_check"
  CHECK (source IN ('OTP','BOOKING_CONFIRMED','BOOKING_UPDATED','BOOKING_CANCELLED','FIRST_CHECK_IN','ADMIN_GROUP','SURVEY'));

-- Existing installations may already have several active templates for one purpose.
-- Pick a deterministic default without changing or deleting any message history.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY purpose ORDER BY active DESC, id ASC) AS position
    FROM sms_templates
)
UPDATE sms_templates AS template
   SET is_default = true
  FROM ranked
 WHERE ranked.id = template.id
   AND ranked.position = 1
   AND template.active = true;

CREATE UNIQUE INDEX "sms_templates_one_active_default_per_purpose_idx"
  ON "sms_templates" (purpose)
  WHERE active = true AND is_default = true;

ALTER TABLE "sms_templates"
  ADD CONSTRAINT "sms_templates_default_requires_active_check"
  CHECK (NOT is_default OR active);
