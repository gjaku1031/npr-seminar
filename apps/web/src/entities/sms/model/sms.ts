/**
 * 문자(SMS) 도메인 어휘 — 명세 v4.0 §5.
 *
 * ⚠️ 이 모듈에 남은 것은 **화면이 쓰는 어휘뿐**이다: byte 추정.
 *   문자 발송 화면(views/sms)은 Nest 계약(shared/api tag: Admin SMS)만 읽고 쓴다 —
 *   대상 수·치환 본문·바이트/타입·배송 상태·배치 집계는 전부 서버가 준다.
 *   용도별 변수·라벨은 관리자 문자 정책 API 응답에서 읽는다.
 *
 * 2026-08 정리: 옛 memory/drizzle server 존 전용이던 `SmsTemplate`·`SmsLog`·`successRate`·
 * `SMS_VARIABLES` 를 제거했다. 계약 타입과 이름만 겹치는 별개 타입이었고 어떤 화면도 쓰지 않았다.
 */


/** SMS/LMS 분기 기준 byte (명세 §5.1) */
const SMS_BYTE_LIMIT = 90;

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
