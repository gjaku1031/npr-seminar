"use client";

/**
 * 콘솔 셸 (widgets/app-shell) — 설계 §8 예고대로 다도메인 조합 블록 첫 승격.
 * 와이어프레임 App 이식: 허브(/)는 미니멀 헤더, 모듈 화면은 TopNav 탭바 (명세 §1.1).
 * 라우팅은 Next 라우터가 담당 — 와이어프레임의 npr-route 저장을 URL이 대체한다.
 */

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { moduleLabel, ALL_MODULES } from "@/entities/user";
import { AvatarMenu } from "@/features/auth";
import { TopNav } from "@/shared/ui";

const MODULE_ROUTE: Record<string, string> = {
  students: "/students",
  sms: "/sms",
  sessions: "/sessions",
  counsel: "/counsel",
  stats: "/stats",
  scanner: "/scanner",
  preview: "/preview",
};

export function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const current = ALL_MODULES.find((m) => pathname.startsWith(MODULE_ROUTE[m]));

  // 허브 — 미니멀 헤더 (와이어프레임 hub 분기)
  if (!current) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <header style={{ height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--violet-800)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11 }}>npr</span>
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--violet-900)", letterSpacing: "-0.02em" }}>입시설명회</span>
          </span>
          <AvatarMenu />
        </header>
        <main key="hub" style={{ animation: "ds-fade-in var(--dur-base) var(--ease-out) both" }}>{children}</main>
      </div>
    );
  }

  // 모듈 — 상단 탭바 (명세 §1.1: 탭 7개, 로고=허브 복귀)
  return (
    <div style={{ minHeight: "100vh" }}>
      <TopNav
        brand="입시설명회"
        brandBadge="npr"
        items={ALL_MODULES.map((m) => ({ label: moduleLabel[m], value: m }))}
        value={current}
        onChange={(m) => router.push(MODULE_ROUTE[m])}
        onBrandClick={() => router.push("/")}
        right={<AvatarMenu />}
      />
      <main key={current} style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "28px var(--container-pad) 60px", animation: "ds-fade-in var(--dur-base) var(--ease-out) both" }}>
        {children}
      </main>
    </div>
  );
}
