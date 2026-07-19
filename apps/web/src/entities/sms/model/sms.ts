/**
 * 문자(SMS) 도메인 모델 — 명세 v4.0 §2 · §5.
 *
 * ⚠️ 이 슬라이스에 남은 것은 **화면이 쓰는 어휘뿐**이다: 변수 칩 목록과 byte 추정.
 *   문자 발송 화면(views/sms)은 이제 Nest 계약(shared/api tag: Admin SMS)만 읽고 쓴다 —
 *   대상 수·치환 본문·바이트/타입·배송 상태·배치 집계는 전부 서버가 준다.
 *
 * 아래 `SmsTemplate`·`SmsLog`·`successRate` 는 옛 memory/drizzle server 존 전용 레거시다
 * (server/repositories·seed). 계약 타입과 이름이 겹치지만 서로 다른 타입이며,
 * 문자 화면은 그 어느 것도 쓰지 않는다.
 *
 * v4.0 개편: 변수 칩에 {문의전화} 추가(캠퍼스별 치환 — 명세 §5.3).
 */

import type { CampusScope } from "@/shared/config/campus";

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
  /** 대상 캠퍼스 — 그룹 발송은 캠퍼스 단위(명세 §5.2), 설문 발송은 '전체' (명세 §6.4) */
  campus: CampusScope;
  ok: number;
  fail: number;
  /** 리마인드·설문 등 자동 발송 여부 (명세 §5.4) */
  auto: boolean;
}

/** 본문에 삽입 가능한 변수 칩 6종 (명세 §5.1) — {문의전화}는 캠퍼스별 치환 */
export const SMS_VARIABLES = [
  "{학생명}",
  "{설명회명}",
  "{일시}",
  "{장소}",
  "{QR링크}",
  "{문의전화}",
] as const;
export type SmsVariable = (typeof SMS_VARIABLES)[number];

/** 설문 문자 전용 변수 (명세 §6.4) */
export const SURVEY_SMS_VARIABLES = ["{학생명}", "{설명회명}", "{설문링크}"] as const;

/** SMS/LMS 분기 기준 byte (명세 §5.1) */
export const SMS_BYTE_LIMIT = 90;

/**
 * 한글 2byte 기준 본문 길이 — 90byte 초과 시 LMS (명세 §5.1).
 *
 * ⚠️ **추정치다.** 서버는 NFC 정규화 뒤 EUC-KR 로 재고, 변수 치환 **후**의 본문을 잰다 —
 * 이 함수는 치환 전 원문을 근사할 뿐이라 값이 다를 수 있다. 작성 중 참고용으로만 쓰고,
 * 발송 확인처럼 정확해야 하는 곳에서는 서버 프리뷰의 `maximumMessageBytes` 를 쓴다.
 */
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
