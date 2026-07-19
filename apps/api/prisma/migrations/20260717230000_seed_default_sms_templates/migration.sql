-- Data-only, idempotent defaults. Operator-created or operator-edited rows are
-- never overwritten when this migration is replayed in a restored environment.
insert into sms_templates(key,name,purpose,title,body,created_by,updated_by)
values
  (
    'BOOKING_CONFIRMED_DEFAULT',
    '예약 확정 + QR',
    'BOOKING_CONFIRMED',
    null,
    E'[npr] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n입장 QR: {QR링크}',
    'system:default-template-seed',
    'system:default-template-seed'
  ),
  (
    'DAY_BEFORE_REMINDER',
    '전일 리마인드',
    'ADMIN_GROUP',
    null,
    '[npr] 내일 {일시} {설명회명}이 진행됩니다. 입장 QR을 준비해 주세요. {QR링크}',
    'system:default-template-seed',
    'system:default-template-seed'
  ),
  (
    'SURVEY_REQUEST_DEFAULT',
    '만족도 설문 요청',
    'SURVEY',
    null,
    '[npr] {학생명} 학부모님, 오늘 설명회는 어떠셨나요? 별점·후기·사진 남기기: {설문링크}',
    'system:default-template-seed',
    'system:default-template-seed'
  ),
  (
    'BOOKING_CANCELLED_DEFAULT',
    '취소 안내',
    'BOOKING_CANCELLED',
    null,
    '[npr] {설명회명} 예약이 취소되었습니다. 문의: {문의전화}',
    'system:default-template-seed',
    'system:default-template-seed'
  )
on conflict(key) do nothing;
