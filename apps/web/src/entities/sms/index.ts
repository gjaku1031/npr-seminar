// entities/sms 공개 API (barrel). (설계 §4.1)
export {
  SMS_VARIABLES,
  SURVEY_SMS_VARIABLES,
  SMS_BYTE_LIMIT,
  smsByteLength,
  isLms,
  successRate,
} from "./model/sms";
export type { SmsTemplate, SmsLog, SmsVariable } from "./model/sms";

// 용도별 변수/라벨은 이 모듈이 단일 진실이다 (백엔드 PURPOSE_VARIABLES 미러) — 위의 레거시 배열이 아니다.
export {
  asEditablePurpose,
  DEFAULT_EDITABLE_PURPOSE,
  EDITABLE_PURPOSE_OPTIONS,
  EDITABLE_SMS_PURPOSES,
  isEditableSmsPurpose,
  newTemplateKey,
  SMS_PURPOSE_LABELS,
  SMS_PURPOSE_VARIABLES,
  variablesForPurpose,
} from "./model/template-purpose";
export type { EditableSmsPurpose } from "./model/template-purpose";
