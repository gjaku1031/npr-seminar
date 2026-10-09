// entities/sms 공개 API (barrel)
export { smsByteLength, isLms } from "./model/sms";

// 편집 정보의 값은 API 정책에서 읽음. 기존 고정 모듈은 테스트의 직접 import 호환용임
export { newTemplateKey, policyForPurpose } from "./model/template-policy";
