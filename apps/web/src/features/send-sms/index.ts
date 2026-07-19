// features/send-sms 공개 API (barrel). (설계 §4.1)
//
// 이전의 memory 서버 액션(api/actions.ts)은 제거했다 — 운영 Nest API 가 아니라 프로세스
// 로컬 메모리에 쓰고도 "발송했어요"를 띄울 수 있어서, 남겨 두는 것만으로 위험했다.
// 이제 이 슬라이스는 계약(tag: Admin SMS)만 호출한다.

export { useSmsGateway } from "./model/useSmsGateway";
export type { SmsGatewayState } from "./model/useSmsGateway";

export { newTemplateKey, useSmsTemplates } from "./model/useSmsTemplates";
export type { SmsTemplatesState } from "./model/useSmsTemplates";

export { useSmsSendFlow } from "./model/useSmsSendFlow";
export type { SmsSendFlowState, SmsSendPhase } from "./model/useSmsSendFlow";

export { useSmsLogs } from "./model/useSmsLogs";
export type { SmsLogsState } from "./model/useSmsLogs";

export { SendConfirmDialog } from "./ui/SendConfirmDialog";
export type { SendConfirmDialogProps } from "./ui/SendConfirmDialog";
