/**
 * 학부모 연락처 입력 정규화·검증 — 순수 함수 (DOM·React 없음, node:test 로 검증).
 *
 * 루트 연락처 조회, 개인 링크 교환(BookingAccessView), 예약/관리 OTP 가 **같은** 규칙을 쓰도록
 * 한곳에 모은다. 계약: 화면은 숫자만 남겨 보내고, 서버가 8~15자리로 정규화한다.
 *
 * ★ 전체 연락처는 화면 메모리에만 잠깐 머문다 — 저장·로깅·URL 노출 금지. 이 모듈은 값을
 *   만들거나 보관하지 않고, 받은 문자열에서 숫자만 추린 새 문자열만 돌려준다.
 */

/** 입력에서 숫자만 남긴다(하이픈·공백 제거). 계약 본문에 실을 정규화 전 전체 번호. */
export function normalizeContactDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** 계약 contact 길이(정규화 8~15자리)를 만족하는가 — 조회·교환·OTP 발송의 공통 게이트. */
export function isCompleteContact(digits: string): boolean {
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * 입력 표시용 하이픈 표기 — 사용자는 숫자만 입력하고 화면에는 `010-7769-7629` 로 보이게 한다.
 *
 * ★ 표기 전용이다. 계약에 싣는 값은 언제나 {@link normalizeContactDigits} 로 다시 숫자만 남기므로
 *   이 함수가 넣은 하이픈은 전송·저장에 영향을 주지 않는다. 값을 만들거나 자르지 않는다.
 *
 * 국내 번호를 앞자리로 끊어 읽어 {@link fmtPhone} 와 같은 형태로 맞춘다: 서울(02)은 `02-XXXX-XXXX`,
 * 휴대폰(010)·11자리 이상은 `010-7769-7629` 처럼 3-4-… 로, 10자리 지역번호(031 등)는 `031-234-5678`
 * 처럼 3-3-4 로 끊는다. 계약 15자리를 넘는 이례적 자릿수는 그럴듯하게 쪼개지 않고 숫자 그대로 둔다.
 */
export function formatContactInput(raw: string): string {
  const digits = normalizeContactDigits(raw);
  if (digits.length === 0) return "";
  // 계약 15자리를 넘는 이례적 입력은 그럴듯하게 쪼개면 오히려 오해를 부른다 — 숫자 그대로 둔다.
  if (digits.length > 15) return digits;
  // 서울(02)은 2-4-4, 휴대폰(010)·11자리 이상은 3-4-…, 10자리 지역번호는 3-3-4 로 fmtPhone 과 맞춘다.
  const heads = digits.startsWith("02")
    ? [2, 4]
    : digits.length >= 11 || digits.startsWith("010")
      ? [3, 4]
      : [3, 3];
  const parts: string[] = [];
  let i = 0;
  for (const size of heads) {
    if (i >= digits.length) break;
    parts.push(digits.slice(i, i + size));
    i += size;
  }
  if (i < digits.length) parts.push(digits.slice(i));
  return parts.join("-");
}
