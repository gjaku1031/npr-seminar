"use client";

/**
 * 콘솔 셸 (widgets/app-shell) — 설계 §8 예고대로 다도메인 조합 블록 첫 승격.
 * 와이어프레임 App 이식: 허브(/admin)는 미니멀 헤더, 모듈 화면은 TopNav 탭바 (명세 §1.1).
 * 라우팅은 Next 라우터가 담당 — 와이어프레임의 npr-route 저장을 URL이 대체한다.
 *
 * 허브가 `/` 에서 `/admin` 으로 옮겨졌다(루트는 학부모 공개 앱). 모듈에 매칭되지 않는
 * `(main)` 경로(=`/admin`)가 미니멀 헤더 분기라는 규칙은 그대로다.
 */

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { moduleLabel, ALL_MODULES } from "@/entities/user";
import { AvatarMenu } from "@/features/auth";
import { BrandMark, TopNav } from "@/shared/ui";

/** 콘솔 허브 — 로고 클릭·로그인 성공이 돌아오는 곳. */
const ADMIN_HOME = "/admin";

const MODULE_ROUTE: Record<string, string> = {
  students: "/students",
  "student-status": "/student-status",
  sms: "/sms",
  sessions: "/sessions",
  counsel: "/counsel",
  stats: "/stats",
  scanner: "/scanner",
};

/**
 * 경로 세그먼트 경계까지 보고 맞춘다 — 맨앞 문자열 일치로는 형제 경로가 서로를 삼킨다
 * (`/student-status` 가 `/students` 탭을 켜는 식). 정확히 같거나 하위 경로일 때만 그 모듈이다.
 */
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** displayName 은 서버 레이아웃이 /auth/me 로 확인한 actor 이름이다 — 셸은 표시만 한다. */
export function ConsoleShell({ children, displayName }: { children: ReactNode; displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const current = ALL_MODULES.find((m) => matchesRoute(pathname, MODULE_ROUTE[m]));

  // 허브(/admin) — 미니멀 헤더 (와이어프레임 hub 분기)
  if (!current) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <header style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <BrandMark size={28} radius={9} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--violet-900)", letterSpacing: "-0.02em" }}>입시설명회</span>
          </span>
          <AvatarMenu displayName={displayName} />
        </header>
        <main key="hub" style={{ animation: "ds-fade-in var(--dur-base) var(--ease-out) both" }}>{children}</main>
      </div>
    );
  }

  // 모듈 — 상단 탭바 (명세 §1.1: 로고=허브 복귀)
  return (
    <div style={{ minHeight: "100vh" }}>
      <TopNav
        brand="입시설명회"
        items={ALL_MODULES.map((m) => ({ label: moduleLabel[m], value: m }))}
        value={current}
        onChange={(m) => router.push(MODULE_ROUTE[m])}
        onBrandClick={() => router.push(ADMIN_HOME)}
        right={<AvatarMenu displayName={displayName} />}
      />
      <main key={current} style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "28px var(--container-pad) 60px", animation: "ds-fade-in var(--dur-base) var(--ease-out) both" }}>
        {children}
      </main>
    </div>
  );
}
