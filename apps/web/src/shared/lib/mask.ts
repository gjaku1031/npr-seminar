/**
 * 공개 화면 표시용 마스킹 (이름·연락처) — 순수 함수. 서버·클라이언트 공용.
 *
 * ★ 표시 전용입니다. API 원본 값을 만들거나 고치지 않고, 새 문자열만 돌려줍니다.
 *   원본은 그대로 보관하고 화면에 그릴 때만 마스킹을 적용합니다.
 *
 * 규칙:
 * - 유니코드 안전 — 코드 포인트 단위(`Array.from`)로 다뤄 서로게이트 쌍을 쪼개지 않습니다.
 * - 이미 마스킹된 문자열(마스킹 문자 포함)은 다시 마스킹하지 않고 그대로 돌려줍니다.
 * - 국내 휴대전화는 `010-****-1234` 형태로 가운데만 가립니다.
 * - 알 수 없는 형식은 형태를 지어내지 않고, 마지막 네 자리만 남긴 채 나머지를 가립니다.
 */

const MASK_CHAR = "*";

/**
 * 이름 마스킹 — 첫 글자와 마지막 글자만 남기고 가운데를 가립니다.
 *
 * - `홍길동` → `홍*동`
 * - `김민` → `김*`
 * - 한 글자 이름도 원문을 노출하지 않고 `*`로 가립니다.
 */
export function maskName(name: string): string {
  if (name.includes(MASK_CHAR)) return name;

  const chars = Array.from(name.trim());
  const len = chars.length;
  if (len === 0) return "";
  if (len === 1) return MASK_CHAR;
  if (len === 2) return `${chars[0]}${MASK_CHAR}`;
  return `${chars[0]}${MASK_CHAR.repeat(len - 2)}${chars[len - 1]}`;
}

/**
 * 연락처 마스킹 — 국내 휴대전화는 가운데를, 그 밖의 번호는 마지막 네 자리만 남기고 가립니다.
 *
 * - 11자리 휴대전화(01x) → `010-****-1234`
 * - 10자리 휴대전화(01x) → `011-***-4567`
 * - 그 외 → 마지막 네 자리만 노출 (예: `*****4567`)
 */
export function maskPhone(contact: string): string {
  if (contact.includes(MASK_CHAR)) return contact;

  const digits = contact.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${MASK_CHAR.repeat(4)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-${MASK_CHAR.repeat(3)}-${digits.slice(6)}`;
  }
  if (digits.length <= 4) return MASK_CHAR.repeat(digits.length);
  return `${MASK_CHAR.repeat(digits.length - 4)}${digits.slice(-4)}`;
}
