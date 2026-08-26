// entities/sms 공개 API (barrel). (설계 §4.1)
export { smsByteLength, isLms } from "./model/sms";

// 편집 정보의 값은 API 정책에서 읽는다. 기존 고정 모듈은 테스트의 직접 import 호환용이다.
export { newTemplateKey, policyForPurpose } from "./model/template-policy";
