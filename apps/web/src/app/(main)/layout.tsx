import { redirect } from "next/navigation";
import { currentUser } from "@/server/services";
import { ConsoleShell } from "@/widgets/app-shell";

/**
 * 콘솔 레이아웃 — 로그인 확인 후 셸(widgets/app-shell)에 위임 (명세 §1.1).
 * 셸은 pathname 으로 현재 모듈을 골라 TopNav 탭바를 켠다.
 *
 * ★ 보호 경계 ★ — `(main)` 아래 모든 화면은 여기를 지나야 렌더된다. `currentUser()` 는
 * 매 요청 Nest 에 되물어(GET /auth/me) ADMIN 세션만 통과시킨다. 이 앱에 다른 인증 판정은
 * 없다 — 프록시/미들웨어 같은 앞단 검사는 우회 가능하므로 데이터 경계인 여기에 둔다.
 *
 * `currentUser()` 가 요청 헤더를 읽으므로 이 레이아웃은 자동으로 동적 렌더된다 —
 * 세션 판정이 정적으로 캐시될 여지가 없다.
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return <ConsoleShell displayName={user.name}>{children}</ConsoleShell>;
}
