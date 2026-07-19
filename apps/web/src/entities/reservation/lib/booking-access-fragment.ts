/**
 * SMS 개인 링크의 URL fragment 파서 — 순수 함수 (DOM 없음, node:test 로 검증).
 *
 * 계약: 원문 access token 은 `/booking/access#token=<43자 base64url>` 의 **fragment 로만** 온다.
 * path·query 로 온 토큰은 계약 위반이므로 이 파서에 넘겨서도 안 되고, 파서는 fragment 만 본다.
 *
 * ⚠️ 반환한 토큰을 문자열화·로깅·저장하지 않는다. 이 함수는 **검증된 원문만** 돌려주고,
 *    호출부가 메모리에서 곧바로 교환에 쓴 뒤 비운다.
 */

/** 계약 accessToken 형식 — 정확히 43자 base64url. */
const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * `#token=<43자>` fragment 에서 원문 access token 을 뽑는다. 형식이 어긋나면 null.
 *
 * 엄격 규칙:
 * - 정확히 하나의 `token=...` 쌍만 허용한다(추가 파라미터·중복 token 거절).
 * - 값은 정확히 43자 base64url 이어야 한다(길이·문자 위반 거절).
 * - `#` 접두는 있어도 없어도 된다(브라우저 `location.hash` 는 붙여 준다).
 */
export function parseBookingAccessFragment(rawHash: string): string | null {
  if (typeof rawHash !== "string") return null;

  const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  if (hash === "") return null;

  // 정확히 하나의 쌍만 — `&` 로 이어진 추가 파라미터는 거절한다.
  if (hash.includes("&")) return null;

  const separator = hash.indexOf("=");
  if (separator === -1) return null;

  const key = hash.slice(0, separator);
  const value = hash.slice(separator + 1);
  if (key !== "token") return null;
  // 값에 또 다른 `=` 가 있으면(잘못된 인코딩) 패턴이 거른다.

  return ACCESS_TOKEN_PATTERN.test(value) ? value : null;
}
