"use client";

/**
 * 콘솔 셸 (widgets/app-shell) — 설계 §8 예고대로 다도메인 조합 블록 첫 승격.
 * 모듈 화면 위에 TopNav 탭바를 얹는다 (명세 §1.1).
 * 라우팅은 Next 라우터가 담당 — 와이어프레임의 npr-route 저장을 URL이 대체한다.
 *
 * 2026-08: 카드 런처 허브(`/admin`)를 제거했다. 콘솔의 실질 진입면은 `/sessions` 이고
 * `/admin` 은 기존 링크 호환을 위한 리다이렉트만 남았다. 허브 전용이던 미니멀 헤더 분기도
 * 함께 정리했다 — 이제 `(main)` 아래는 전부 탭바 하나로 통일된다.
 */

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { moduleLabel, ALL_MODULES } from "@/entities/user";
import { AvatarMenu } from "@/features/auth";
import { TopNav } from "@/shared/ui";

/** 콘솔 홈 — 로고 클릭이 돌아오는 곳. */
const CONSOLE_HOME = "/sessions";

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

  /**
   * 어느 모듈에도 매칭되지 않을 수 있다 — 그때는 탭을 하나도 켜지 않는다.
   * TopNav 의 `value` 는 선택 항목이라 undefined 면 필이 안 그려질 뿐 셸은 그대로 선다.
   * 없는 탭을 임의로 켜서 사용자가 다른 화면에 있다고 오해하게 만들지 않는다.
   */
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
