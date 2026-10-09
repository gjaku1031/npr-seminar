// 공개 화면 표시용 이름·연락처 마스킹. 서버·클라이언트 공용 순수 함수
// 표시 전용: API 원본 값을 만들거나 고치지 않고 새 문자열만 반환. 원본은 그대로 두고 그릴 때만 적용
// - 코드 포인트 단위(Array.from)로 다뤄 서로게이트 쌍을 쪼개지 않음
// - 이미 마스킹 문자가 든 문자열은 다시 마스킹하지 않음
// - 국내 휴대전화는 `010-****-1234`처럼 가운데만 가림
// - 알 수 없는 형식은 형태를 지어내지 않고 끝 네 자리만 남김

/**
 * 마스킹 문자
 */
const MASK_CHAR = "*";

/**
 * 이름 마스킹. 첫 글자와 마지막 글자만 남김
 *
 * `홍길동` → `홍*동`, `김민` → `김*`, 한 글자는 `*`
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
 * 연락처 마스킹
 *
 * 11자리 휴대전화(01x) → `010-**-1234`, 10자리 휴대전화 → `011-*-4567`, 그 외는 끝 네 자리만 노출(`*4567`)
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
