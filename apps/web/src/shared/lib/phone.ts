/**
 * 연락처 표기 — 계약이 주는 정규화 숫자열(8~15자리)을 사람이 읽는 형태로만 바꾼다.
 * 순수 함수 — 서버·클라이언트 공용.
 *
 * ★ 표기 전용이다. 값을 만들거나 고치지 않는다: 아는 국내 형태(10·11자리)가 아니면
 *   정규화 원본을 그대로 돌려준다. 모르는 번호를 그럴듯하게 쪼개는 쪽이 더 위험하다.
 */

/**
 * 국내 10/11자리 전화번호를 하이픈 표기로. 그 외에는 받은 값 그대로.
 *
 * - 11자리 → `010-1234-5678`
 * - 10자리 서울(02) → `02-1234-5678`
 * - 10자리 그 외 → `031-234-5678`
 */
export function fmtPhone(contact: string): string {
  const digits = contact.replace(/\D/g, "");
  if (digits.length !== contact.length) return contact;

  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) {
    return digits.startsWith("02")
      ? `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
      : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return contact;
}
