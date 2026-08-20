// entities/sms 공개 API (barrel). (설계 §4.1)
export { smsByteLength, isLms } from "./model/sms";

// 용도별 변수/라벨은 이 모듈이 단일 진실이다 (백엔드 PURPOSE_VARIABLES 미러).
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
