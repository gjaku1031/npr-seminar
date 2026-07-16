// entities/sms 공개 API (barrel). (설계 §4.1)
export { SMS_VARIABLES, SMS_BYTE_LIMIT, smsByteLength, isLms, successRate } from "./model/sms";
export type { SmsTemplate, SmsLog, SmsVariable } from "./model/sms";
