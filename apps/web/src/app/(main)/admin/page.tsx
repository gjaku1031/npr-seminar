import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * `/admin` 은 더 이상 쓰는 목적지가 아니다 — 운영 콘솔의 실질 진입면인 `/sessions` 로 넘긴다.
 *
 * 인증 경계는 그대로다: `(main)` 레이아웃이 매 요청 로그인(ADMIN 세션)을 강제하고(비로그인 →
 * `/login`), 모듈 접근 판정은 목적지(`/sessions`)가 자체적으로 한다. 여기서 별도 우회를 만들지 않는다.
 */
export default function AdminHubPage() {
  redirect("/sessions");
}
