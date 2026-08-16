import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/admin` 은 기존 링크·북마크 호환만을 위한 리다이렉트다 — 운영 콘솔의 실질 진입면인
 * `/sessions` 로 넘긴다.
 *
 * 여기 있던 카드 런처 허브는 2026-08 에 제거했다. 콘솔 이동은 TopNav 탭바가 전담하고,
 * 허브가 보여 주던 요약 수치는 각 모듈 화면이 자기 것을 직접 보여 준다.
 *
 * 인증 경계는 그대로다: `(main)` 레이아웃이 매 요청 로그인(ADMIN 세션)을 강제하고(비로그인 →
 * `/login`), 모듈 접근 판정은 목적지(`/sessions`)가 자체적으로 한다. 여기서 별도 우회를 만들지 않는다.
 */
export default function AdminHubPage() {
  redirect("/sessions");
}
