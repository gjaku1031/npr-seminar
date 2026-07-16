import { redirect } from "next/navigation";
import { currentUser } from "@/server/services";
import { LoginForm } from "@/features/auth";

export const dynamic = "force-dynamic";

/**
 * 로그인 게이트 (명세 §1.1 · 12.1 · flows OWNER-F1).
 * 역할 선택: 원장 / 실장 / 강사. 학부모·학생은 로그인 없이 /reserve만 이용한다.
 */
export default async function LoginPage() {
  if (await currentUser()) redirect("/");

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-12">
      <header className="mb-8">
        <p className="text-xl font-bold text-ink">npr</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">입시설명회 운영 콘솔</h1>
        <p className="mt-1 text-sm text-muted">역할을 선택해 입장하세요.</p>
      </header>

      <LoginForm />

      <p className="mt-8 text-xs text-faint">
        학부모·학생은 로그인 없이{" "}
        <a href="/reserve" className="text-brand hover:text-accent">
          모바일 예약
        </a>
        을 이용합니다.
      </p>
    </div>
  );
}
