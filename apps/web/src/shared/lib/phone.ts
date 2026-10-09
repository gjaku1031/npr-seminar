// 연락처 표기. 계약이 주는 정규화 숫자열(8~15자리)을 읽기 쉬운 형태로만 변환. 서버·클라이언트 공용 순수 함수
// 표기 전용: 아는 국내 형태(10·11자리)가 아니면 원본을 그대로 반환. 모르는 번호를 그럴듯하게 쪼개는 쪽이 더 위험함

/**
 * 국내 10·11자리 번호를 하이픈 표기로 변환. 그 외 또는 숫자 외 문자가 있으면 그대로
 *
 * 11자리 → `010-1234-5678`, 서울(02) 10자리 → `02-1234-5678`, 그 외 10자리 → `031-234-5678`
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
