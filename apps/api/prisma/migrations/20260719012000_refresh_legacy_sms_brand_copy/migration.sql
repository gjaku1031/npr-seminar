-- Refresh only the four immutable seed identities and only while their body is
-- still byte-for-byte equal to the shipped legacy copy. Operator edits and
-- operator-created templates are deliberately outside this migration.
UPDATE sms_templates
   SET body = E'[예시학원] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n예약 및 입장 QR 확인: {예약확인링크}',
       version = version + 1,
       updated_by = 'system:brand-copy-migration',
       updated_at = current_timestamp
 WHERE key = 'BOOKING_CONFIRMED_DEFAULT'
   AND body = E'[npr] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n입장 QR: {QR링크}';

UPDATE sms_templates
   SET body = '[예시학원] 내일 {일시} {설명회명}이 진행됩니다. 예약 및 입장 QR을 확인해 주세요. {예약확인링크}',
       version = version + 1,
       updated_by = 'system:brand-copy-migration',
       updated_at = current_timestamp
 WHERE key = 'DAY_BEFORE_REMINDER'
   AND body = '[npr] 내일 {일시} {설명회명}이 진행됩니다. 입장 QR을 준비해 주세요. {QR링크}';

UPDATE sms_templates
   SET body = '[예시학원] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기 남기기: {설문링크}',
       version = version + 1,
       updated_by = 'system:brand-copy-migration',
       updated_at = current_timestamp
 WHERE key = 'SURVEY_REQUEST_DEFAULT'
   AND body = '[npr] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기·사진 남기기: {설문링크}';

UPDATE sms_templates
   SET body = '[예시학원] {설명회명} 예약이 취소되었습니다. 문의: {문의전화}',
       version = version + 1,
       updated_by = 'system:brand-copy-migration',
       updated_at = current_timestamp
 WHERE key = 'BOOKING_CANCELLED_DEFAULT'
   AND body = '[npr] {설명회명} 예약이 취소되었습니다. 문의: {문의전화}';
