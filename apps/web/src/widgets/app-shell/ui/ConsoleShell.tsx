"use client";

/**
 * 관리자 콘솔 셸. 모듈 화면 위에 TopNav 탭바를 얹음
 * 라우팅은 Next 라우터와 URL 이 담당
 *
 * 콘솔 진입 화면은 `/sessions`. `/admin` 은 기존 링크 호환용 리다이렉트만 있음
 * `(main)` 아래 모든 화면이 같은 탭바를 씀
 */

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { moduleLabel, ALL_MODULES } from "@/entities/user";
import { AvatarMenu } from "@/features/auth";
import { TopNav } from "@/shared/ui";

/**
 * 콘솔 홈 — 로고 클릭이 돌아오는 곳
 */
const CONSOLE_HOME = "/sessions";

/**
 * 콘솔 모듈별 경로
 */
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
 * 경로 세그먼트 경계까지 보고 맞춤 — 맨앞 문자열 일치로는 형제 경로가 서로를 삼킴
 * (`/student-status` 가 `/students` 탭을 켜는 식). 정확히 같거나 하위 경로일 때만 그 모듈임
 */
function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * displayName 은 서버 레이아웃이 /auth/me 로 확인한 actor 이름임 — 셸은 표시만 함
 */
export function ConsoleShell({ children, displayName }: { children: ReactNode; displayName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // 어느 모듈에도 매칭되지 않을 수 있음 — 그때는 탭을 하나도 켜지 않음
  // TopNav 의 `value` 는 선택 항목이라 undefined 면 필이 안 그려질 뿐 셸은 그대로 섬
  // 없는 탭을 임의로 켜서 사용자가 다른 화면에 있다고 오해하게 만들지 않음
  const current = ALL_MODULES.find((m) => matchesRoute(pathname, MODULE_ROUTE[m]));

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopNav
        brand="입시설명회"
        items={ALL_MODULES.map((m) => ({ label: moduleLabel[m], value: m }))}
        value={current}
        onChange={(m) => router.push(MODULE_ROUTE[m])}
        onBrandClick={() => router.push(CONSOLE_HOME)}
        right={<AvatarMenu displayName={displayName} />}
      />
      <main key={current ?? "unmatched"} style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "28px var(--container-pad) 60px", animation: "ds-fade-in var(--dur-base) var(--ease-out) both" }}>
        {children}
      </main>
    </div>
  );
}
