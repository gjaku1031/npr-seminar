import { redirect } from "next/navigation";
import { currentUser } from "@/server/services";
import { LoginForm } from "@/features/auth";

export const dynamic = "force-dynamic";

/**
 * 로그인 게이트 (명세 §1.1 · flows ADMIN-F1) — 단일 관리자, 역할 선택 없음.
 * 학부모·학생은 로그인 없이 공개 루트(`/`)만 이용한다.
 */
export default async function LoginPage() {
  // 이미 로그인한 **관리자**만 콘솔 허브로 — 루트는 학부모 앱이라 여기로 보내면 안 된다.
  //
  // currentUser() 는 ADMIN 세션에만 값을 준다. 익명·만료·무효는 물론 SCANNER 세션도 null 이라
  // 그대로 이 화면에 남는다 — 리다이렉트 루프가 생길 수 없다: `(main)` 레이아웃이 여기로 보내는
  // 조건과 여기서 나가는 조건이 정확히 같은 술어(ADMIN 여부)의 양면이기 때문이다.
  if (await currentUser()) redirect("/admin");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <LoginForm />
    </div>
  );
}
