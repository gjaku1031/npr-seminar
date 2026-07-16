"use client";

/**
 * 모바일예약 프리뷰 (명세 §3.1 · flows ADMIN-F8) — 와이어프레임 PreviewScreen 이식.
 * 폰 프레임(390×844 비율 고정, 뷰포트에 맞춰 스케일) 안에서 ReserveFlow를 구동한다.
 * 프리뷰 예약·설문도 같은 서버 데이터를 쓰므로 콘솔에 즉시 반영된다 (명세 A-05).
 */

import { useEffect, useState } from "react";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import { Badge, Button, Icons } from "@/shared/ui";
import { ReserveFlow } from "@/widgets/reserve-flow";

export interface PreviewViewProps {
  sessions: Session[];
  students: Student[];
  reservations: Reservation[];
}

const FRAME_W = 412;
const FRAME_H = 866; // 베젤 포함

export function PreviewView({ sessions, students, reservations }: PreviewViewProps) {
  const [resetKey, setResetKey] = useState(0);
  /* 실기기 비율 고정: 화면 390×844 (iPhone 14 기준) — 뷰포트에 맞춰 통째로 스케일 */
  const calcScale = () =>
    typeof window === "undefined" ? 1 : Math.max(0.55, Math.min(1, (window.innerHeight - 250) / FRAME_H));
  const [scale, setScale] = useState(1);
  useEffect(() => {
    // 최초 스케일 산출은 rAF로 미뤄 이펙트 내 동기 setState(연쇄 렌더)를 피한다
    const raf = requestAnimationFrame(() => setScale(calcScale()));
    const onR = () => setScale(calcScale());
    window.addEventListener("resize", onR);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onR);
    };
  }, []);

  return (
    <div data-screen-label="모바일예약 프리뷰" style={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 92px)" }}>
      {/* 상단 바 */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>MOBILE PREVIEW</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>모바일예약 프리뷰</h1>
            <Badge tone="accent" dot>테스트 전용</Badge>
            <Badge tone="info">실제 문자 미발송</Badge>
          </div>
        </div>
        <Button variant="secondary" icon={<Icons.refresh size={15} />} onClick={() => setResetKey(resetKey + 1)}>프리뷰 초기화</Button>
      </div>

      {/* 정중앙 폰 프레임 — 390×844 고정비, 가로 스크롤 없음 */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 0 12px", animation: "ds-fade-up var(--dur-slow) var(--ease-out) 150ms both" }}>
        <div style={{ width: FRAME_W * scale, height: FRAME_H * scale, flexShrink: 0 }}>
          <div style={{ width: FRAME_W, transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <div style={{ width: FRAME_W, height: FRAME_H, borderRadius: 56, background: "var(--violet-950)", padding: 11, boxSizing: "border-box", boxShadow: "var(--shadow-float)" }}>
              <div style={{ position: "relative", borderRadius: 46, overflow: "hidden", background: "var(--surface-page)", width: 390, height: 844 }}>
                <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", width: 118, height: 28, borderRadius: 16, background: "var(--violet-950)", zIndex: 20 }} />
                <div key={resetKey} style={{ position: "absolute", inset: 0, overflowY: "auto", overflowX: "hidden", paddingTop: 44 }}>
                  <ReserveFlow sessions={sessions} students={students} reservations={reservations} compact />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-faint)", marginTop: 12, lineHeight: 1.7 }}>
          실기기 화면비(390×844) 고정 · 여기서 만든 예약은 콘솔 데이터에 즉시 반영 · 재원생 조회는 명단 번호 일부(예: 3200)로 검색
          <br />
          실기기 화면은 허브의 <b style={{ color: "var(--text-muted)" }}>모바일 예약 페이지 열기</b>
        </div>
      </div>
    </div>
  );
}
