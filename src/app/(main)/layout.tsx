import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/services";
import { allowedModules, moduleLabel, roleLabel } from "@/entities/user";
import { SignOutButton } from "@/features/auth";

const MODULE_ROUTE: Record<string, string> = {
  students: "/students",
  phone: "/phone",
  sms: "/sms",
  sessions: "/sessions",
  counsel: "/counsel",
  stats: "/stats",
  scanner: "/scanner",
  preview: "/preview",
};

/**
 * 콘솔 셸 — 상단 헤더 탭바 (명세 §3.1). 역할별 허용 탭만 노출한다.
 * 다도메인 조합이 커지면 widgets/app-shell로 승격한다 (설계 §8).
 */
export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
        {/* 로고 클릭 시 허브 복귀 (명세 §3.1) */}
        <Link href="/" className="text-xl font-bold text-ink">
          npr
        </Link>

        <nav className="flex flex-wrap gap-3 text-sm">
          {allowedModules(user.role).map((key) => (
            <Link key={key} href={MODULE_ROUTE[key]} className="text-muted transition-colors hover:text-brand">
              {moduleLabel[key]}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">
            {roleLabel[user.role]} · {user.name}
          </span>
          <SignOutButton />
        </div>
      </header>

      <main>{children}</main>
    </div>
  );
}
