import { redirect } from "next/navigation";
import { currentUser } from "@/server/services";
import { LoginForm } from "@/features/auth";

export const dynamic = "force-dynamic";

/**
 * 로그인 게이트 (명세 §1.1 · flows ADMIN-F1) — 단일 관리자, 역할 선택 없음.
 * 학부모·학생은 로그인 없이 /reserve만 이용한다.
 */
export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <LoginForm />
    </div>
  );
}
