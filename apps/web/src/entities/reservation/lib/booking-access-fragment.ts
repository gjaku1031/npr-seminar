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

/** location.hash 가 실제 조각을 담고 있는지 — `""`·`"#"` 는 비어 있는 것으로 본다. */
function fragmentHashHasContent(rawHash: string): boolean {
  if (typeof rawHash !== "string") return false;
  const hash = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  return hash !== "";
}

/** 첫 mount 초기화에 필요한 최소 location 조각 — hash 와 재작성 대상(pathname+search). */
export interface BookingAccessLocationInit {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

/** 첫 mount 초기화 결과 — 확정 phase, 유효 토큰(메모리 전용), 주소창 정리 지시. */
export interface BookingAccessFragmentInit {
  readonly phase: "ready" | "missing";
  /** 유효하게 파싱된 원문 토큰만 담는다. 형식 위반이면 null. */
  readonly token: string | null;
  /**
   * hash 가 비어 있지 않았다면 주소창·history 를 재작성할 URL(정확히 pathname+search).
   * hash 가 비어 있으면 null — 재작성이 필요 없다.
   * ⚠️ 이 URL 에는 fragment 를 절대 담지 않는다 — 잘못된 조각도 그대로 버린다.
   */
  readonly cleanUrl: string | null;
}

/**
 * 첫 mount fragment 초기화 — 순수 함수(DOM 없음, node:test 로 검증).
 *
 * 규칙:
 * - 유효 토큰은 정리 판정 전에 파싱해 캐시한다 — 정리로 유효 토큰을 잃지 않는다.
 * - hash 가 비어 있지 않으면 **파싱 성공 여부와 무관하게** 항상 정리(cleanUrl 반환)를 요청한다 —
 *   잘못되거나 파라미터가 여럿인 조각도 주소창·history 에 남지 않는다.
 * - 정리 URL 은 정확히 pathname+search 다. fragment·token 을 path/query 로 옮기지 않는다.
 */
export function initBookingAccessFragment(
  location: BookingAccessLocationInit,
): BookingAccessFragmentInit {
  const token = parseBookingAccessFragment(location.hash);
  const cleanUrl = fragmentHashHasContent(location.hash)
    ? `${location.pathname}${location.search}`
    : null;
  return {
    phase: token === null ? "missing" : "ready",
    token,
    cleanUrl,
  };
}
