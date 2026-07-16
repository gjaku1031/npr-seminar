/**
 * 문자(SMS) 도메인 모델 — 명세 §2 · §6.
 * SmsTemplate·SmsLog는 같은 도메인 관심사라 한 슬라이스에 묶는다.
 * ⚠️ 실제 게이트웨이 미연동 — 발송은 로그 적재까지가 현재 범위 (명세 §11).
 */

export interface SmsTemplate {
  id: string;
  name: string;
  body: string;
}

export interface SmsLog {
  id: string;
  when: Date;
  /** 수신 인원 수 */
  to: number;
  /** 사용 템플릿 이름 (스냅샷 — 템플릿이 나중에 바뀌어도 로그는 발송 시점을 남긴다) */
  template: string;
  /** 대상 설명회 제목 스냅샷 */
  session: string;
  ok: number;
  fail: number;
  /** 리마인드 등 자동 발송 여부 (명세 12.5) */
  auto: boolean;
}

/** 본문에 삽입 가능한 변수 칩 (명세 §6.2) */
export const SMS_VARIABLES = ["{학생명}", "{설명회명}", "{일시}", "{장소}", "{QR링크}"] as const;
export type SmsVariable = (typeof SMS_VARIABLES)[number];

/** SMS/LMS 분기 기준 byte (명세 §6.3) */
export const SMS_BYTE_LIMIT = 90;

/** 한글 2byte 기준 본문 길이 — 90byte 초과 시 LMS (명세 §6.3) */
export function smsByteLength(body: string): number {
  let bytes = 0;
  for (const ch of body) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

export function isLms(body: string): boolean {
  return smsByteLength(body) > SMS_BYTE_LIMIT;
}

export function successRate(log: SmsLog): number {
  const total = log.ok + log.fail;
  return total === 0 ? 0 : Math.round((log.ok / total) * 100);
}
