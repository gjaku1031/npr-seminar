import { redirect } from "next/navigation";
import { currentUser } from "@/server/services";
import { ConsoleShell } from "@/widgets/app-shell";

/**
 * 콘솔 레이아웃 — 로그인 확인 후 셸(widgets/app-shell)에 위임 (명세 §1.1).
 * 허브(/)는 미니멀 헤더, 모듈 화면은 TopNav 탭바 — 분기는 셸이 pathname으로 판단한다.
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return <ConsoleShell>{children}</ConsoleShell>;
}
