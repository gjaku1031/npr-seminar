import { NextResponse } from "next/server";

/**
 * ★ 인증 가드 이음새 (설계 §8) ★ — Next 16 `proxy` 규약 (구 `middleware`).
 *
 * 지금은 의도적 통과형. 인증 도입 시 — 풀스택이므로 참고 구조와 달리 처음부터
 * 세션=httpOnly 쿠키가 자연스럽다 — 여기서 쿠키 존재를 검사해 /login 리다이렉트로 승격한다.
 * 구현 시그니처: export function proxy(request: NextRequest) { ... }
 */
export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/seminars/:path*"],
};
