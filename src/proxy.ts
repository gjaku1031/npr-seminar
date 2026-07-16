import { NextResponse, type NextRequest } from "next/server";

/**
 * ★ 인증 가드 (설계 §8) ★ — Next 16 `proxy` 규약 (구 `middleware`).
 *
 * 풀스택이라 세션을 httpOnly 쿠키로 두므로 서버/엣지에서 쿠키를 읽어 가드할 수 있다.
 * 여기서는 **쿠키 존재만** 확인해 로그인 화면으로 돌린다(값싼 1차 방어).
 * v4.0: 단일 관리자 — 모듈별 권한 판정이 사라졌고, 각 페이지의 requireModuleAccess는
 * 로그인 확정 + 향후 역할 재도입 지점으로 유지된다 (설계 §6.5).
 *
 * ⚠️ 쿠키 존재 ≠ 인증. 실제 로그인 도입 시 서명 검증이 여기(또는 auth.service)에 들어온다.
 */
const ROLE_COOKIE = "npr-user";

export function proxy(request: NextRequest) {
  if (request.cookies.has(ROLE_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

/**
 * 콘솔 라우트만 가드한다. v4.0에서 전화예약(/phone) 모듈 폐기.
 * 제외: `/login`(게이트 자신), `/reserve`(학부모 공개 예약 — 로그인 없음, 명세 §10).
 */
export const config = {
  matcher: [
    "/",
    "/students/:path*",
    "/sms/:path*",
    "/sessions/:path*",
    "/counsel/:path*",
    "/stats/:path*",
    "/scanner/:path*",
    "/preview/:path*",
  ],
};
