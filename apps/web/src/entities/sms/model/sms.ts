/**
 * 문자(SMS) 도메인 어휘
 *
 * ⚠️ 이 모듈에 남은 것은 화면이 쓰는 어휘뿐임: byte 추정
 *   문자 발송 화면(views/sms)은 Nest 계약(shared/api tag: Admin SMS)만 읽고 씀 —
 *   대상 수·치환 본문·바이트/타입·배송 상태·배치 집계는 전부 서버가 줌
 *   용도별 변수·라벨은 관리자 문자 정책 API 응답에서 읽음
 */


/**
 * SMS/LMS 분기 기준 바이트
 */
const SMS_BYTE_LIMIT = 90;

/**
 * 한글 2byte 기준 본문 길이 — 90byte 초과 시 LMS
 *
 * ⚠️ 추정치임. 서버는 NFC 정규화 뒤 EUC-KR 로 재고, 변수 치환 후의 본문을 잼 —
 * 이 함수는 치환 전 원문을 근사할 뿐이라 값이 다를 수 있음. 작성 중 참고용으로만 쓰고,
 * 발송 확인처럼 정확해야 하는 곳에서는 서버 프리뷰의 `maximumMessageBytes` 를 씀
 */
export function smsByteLength(body: string): number {
  let bytes = 0;
  for (const ch of body) bytes += ch.charCodeAt(0) > 0x7f ? 2 : 1;
  return bytes;
}

/**
 * 추정 본문 바이트가 90을 넘으면 LMS
 */
export function isLms(body: string): boolean {
  return smsByteLength(body) > SMS_BYTE_LIMIT;
}
