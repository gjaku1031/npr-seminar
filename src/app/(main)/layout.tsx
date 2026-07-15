import Link from "next/link";

/** 앱 셸 자리 — 첫 다도메인 조합 블록이 나오면 widgets/app-shell로 승격한다 (설계 §8). */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-baseline justify-between">
        <Link href="/seminars" className="text-xl font-bold">
          NPR Seminar
        </Link>
        <nav className="text-sm text-gray-500">
          <Link href="/seminars">세미나</Link>
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
