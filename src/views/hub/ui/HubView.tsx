import Link from "next/link";
import { allowedModules, moduleLabel, roleLabel, type ModuleKey, type User } from "@/entities/user";
import type { Session } from "@/entities/session";

/** 모듈 → 라우트 (명세 §3.1 카드 런처 허브) */
const MODULE_ROUTE: Record<ModuleKey, string> = {
  students: "/students",
  phone: "/phone",
  sms: "/sms",
  sessions: "/sessions",
  counsel: "/counsel",
  stats: "/stats",
  scanner: "/scanner",
  preview: "/preview",
};

const ALL: ModuleKey[] = ["students", "phone", "sms", "sessions", "counsel", "stats", "scanner", "preview"];

const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" });

/**
 * 허브 = 카드 런처 (명세 §3).
 * 권한 없는 모듈은 잠금 표시 (flows GANGSA-F1: 강사는 재원생·통계 잠금).
 * 데이터는 page(RSC)가 props로 내려준다 — views는 서버를 모른다 (설계 §5).
 */
export function HubView({ user, upcoming }: { user: User; upcoming: Session | null }) {
  const allowed = new Set(allowedModules(user.role));

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm text-muted">
          {roleLabel[user.role]} · {user.name}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">운영 콘솔</h1>
      </section>

      {/* 다가오는 설명회 칩 (명세 §3.3) */}
      {upcoming && (
        <Link
          href="/sessions"
          className="flex items-center gap-3 rounded-sm border border-hairline bg-brand-soft px-4 py-3 transition-shadow hover:shadow-card"
        >
          <span className="size-2 shrink-0 rounded-pill bg-accent" aria-hidden />
          <span className="text-sm">
            <span className="font-semibold text-ink">{upcoming.title}</span>
            <span className="ml-2 text-muted">
              {dateFormat.format(upcoming.date)} {upcoming.time} · {upcoming.place}
            </span>
          </span>
        </Link>
      )}

      {/* 모듈 런처 카드 8장 (명세 §3.1) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">모듈</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ALL.map((key) => {
            const locked = !allowed.has(key);
            return (
              <li key={key}>
                {locked ? (
                  <div
                    aria-disabled
                    className="flex h-full flex-col rounded-md border border-hairline bg-sunken p-4 opacity-60"
                  >
                    <span className="font-semibold text-faint">{moduleLabel[key]}</span>
                    <span className="mt-1 text-xs text-faint">🔒 권한 없음</span>
                  </div>
                ) : (
                  <Link
                    href={MODULE_ROUTE[key]}
                    className="flex h-full flex-col rounded-md border border-hairline bg-card p-4 shadow-card transition-shadow hover:shadow-raised"
                  >
                    <span className="font-semibold text-ink">{moduleLabel[key]}</span>
                    <span className="mt-1 text-xs text-muted">열기 →</span>
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* 모바일 예약 페이지 링크 (명세 §3.4) */}
      <section>
        <Link href="/reserve" target="_blank" className="text-sm text-brand hover:text-accent">
          학부모 모바일 예약 페이지 열기 ↗
        </Link>
      </section>
    </div>
  );
}
