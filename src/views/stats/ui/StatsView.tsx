"use client";

/**
 * 통계 (명세 §8, flows ADMIN-F6) — 와이어프레임 StatsScreen 이식.
 * 설명회 × 캠퍼스 필터 · 지표 5카드 · 채널 도넛(모바일/수동) · 단위별 예약률·참석률 · 평균 만족도.
 * 필터 즉시 반응을 위해 원자료를 받아 클라이언트에서 집계한다(와이어프레임 동일).
 */

import { useState } from "react";
import type { Reservation } from "@/entities/reservation";
import type { Session } from "@/entities/session";
import type { Student } from "@/entities/student";
import type { SurveyResponse } from "@/entities/survey";
import { CAMPUSES } from "@/shared/config/campus";
import { Card, Icons, Select, StatCard, Tag } from "@/shared/ui";

export interface StatsViewProps {
  sessions: Session[];
  reservations: Reservation[];
  students: Student[];
  surveys: SurveyResponse[];
}

interface UnitRow {
  label: string;
  total: number;
  res: number;
  ent: number;
}

function BarPair({ row, i }: { row: UnitRow; i: number }) {
  const resRate = row.total ? Math.round((row.res / row.total) * 100) : 0;
  const entRate = row.res ? Math.round((row.ent / row.res) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr", gap: 14, alignItems: "center", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 40}ms both` }}>
      <span style={{ fontSize: 12.5, fontWeight: row.label === "전체" ? 800 : 600, color: "var(--text-strong)" }}>{row.label}</span>
      <span>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-faint)", marginBottom: 3 }}>
          <span>예약률</span>
          <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: "var(--violet-800)" }}>
            {resRate}% <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({row.res}/{row.total})</span>
          </span>
        </span>
        <span style={{ display: "block", height: 8, borderRadius: 4, background: "var(--gray-2)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${resRate}%`, background: "var(--violet-600)", transition: "width var(--dur-hero) var(--ease-smooth)" }} />
        </span>
      </span>
      <span>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-faint)", marginBottom: 3 }}>
          <span>참석률</span>
          <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: "var(--mint-600)" }}>
            {entRate}% <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({row.ent}/{row.res})</span>
          </span>
        </span>
        <span style={{ display: "block", height: 8, borderRadius: 4, background: "var(--gray-2)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${entRate}%`, background: "var(--mint-500)", transition: "width var(--dur-hero) var(--ease-smooth)" }} />
        </span>
      </span>
    </div>
  );
}

export function StatsView({ sessions, reservations, students, surveys }: StatsViewProps) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const [campus, setCampus] = useState("전체");
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0];

  if (!session) {
    return (
      <div data-screen-label="통계 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>등록된 설명회가 없어요.</div>
      </div>
    );
  }

  const inCampus = (c: string) => campus === "전체" || c === campus;
  const rs = reservations.filter((r) => r.sessionId === session.id && inCampus(r.campus));
  const active = rs.filter((r) => r.status !== "cancelled");
  const entered = active.filter((r) => r.status === "entered");
  const noShow = active.filter((r) => r.status === "no_show");
  const attendRate = active.length ? Math.round((entered.length / active.length) * 100) : 0;
  const noShowRate = active.length ? Math.round((noShow.length / active.length) * 100) : 0;

  /* 채널: 모바일(웹앱) / 수동 (명세 §8.3) */
  const chMobile = active.filter((r) => r.source === "웹앱").length;
  const chManual = active.length - chMobile;
  const chTotal = active.length || 1;
  const mobileDeg = (chMobile / chTotal) * 360;

  /* 단위별 예약률·참석률 — 특목 탭은 예중1·예고1 포함 (명세 §8.4) */
  const stuIn = students.filter((s) => inCampus(s.campus));
  const UNITS = ["초등", "중등1", "중등2", "중등3", "특목", "고등", "과학"];
  const unitRows: UnitRow[] = [
    { label: "전체", total: stuIn.length, res: active.filter((r) => r.member).length, ent: entered.filter((r) => r.member).length },
    ...UNITS.map((u) => {
      const isU = (unit: string) => unit === u || (u === "특목" && (unit === "예중1" || unit === "예고1"));
      const match = (r: Reservation) => r.member && isU(r.unit);
      return {
        label: u === "중등1" ? "중1" : u === "중등2" ? "중2" : u === "중등3" ? "중3" : u,
        total: stuIn.filter((s) => isU(s.unit)).length,
        res: active.filter(match).length,
        ent: entered.filter(match).length,
      };
    }),
  ];

  const sessionSurveys = surveys.filter((v) => v.sessionId === session.id);
  const avgRating = sessionSurveys.length
    ? sessionSurveys.reduce((a, b) => a + b.rating, 0) / sessionSurveys.length
    : 0;

  return (
    <div data-screen-label="통계 대시보드">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>ANALYTICS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <Select options={sessions.map((s) => ({ label: s.title, value: s.id }))} value={sessionId} onChange={setSessionId} style={{ width: 250 }} />
          <div style={{ display: "flex", gap: 6 }}>
            {["전체", ...CAMPUSES].map((c) => (
              <Tag key={c} selected={campus === c} onClick={() => setCampus(c)} style={{ height: 34 }}>
                {c.replace("캠퍼스", "")}
              </Tag>
            ))}
          </div>
        </div>
      </div>

      {/* 지표 5카드 (명세 §8.2) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 20 }}>
        <StatCard label="전체 인원" value={stuIn.length} suffix="명" tone="neutral" icon={<Icons.users size={15} />} delay={0} />
        <StatCard label="총 예약" value={active.length} suffix="건" tone="brand" icon={<Icons.ticket size={15} />} delay={50} />
        <StatCard label="입장 완료" value={entered.length} suffix="명" tone="success" icon={<Icons.userCheck size={15} />} delay={100} />
        <StatCard label="참석률" value={attendRate} suffix="%" tone="accent" icon={<Icons.trendingUp size={15} />} delay={150} />
        <StatCard label="노쇼율" value={noShowRate} suffix="%" tone="neutral" icon={<Icons.alertTriangle size={15} />} delay={200} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* 단위별 예약률·참석률 (명세 §8.4) */}
        <Card padding="20px 22px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 200ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Icons.barChart size={16} style={{ color: "var(--violet-800)" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)" }}>단위별 예약률 · 참석률</span>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>예약률 = 예약/단위 인원 · 참석률 = 참석/예약</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {unitRows.map((row, i) => (
              <BarPair key={row.label} row={row} i={i} />
            ))}
          </div>
        </Card>

        {/* 채널별 예약 도넛 (명세 §8.3) */}
        <Card padding="20px 22px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 260ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Icons.pieChart size={16} style={{ color: "var(--mint-600)" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)" }}>채널별 예약</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ width: 120, height: 120, borderRadius: "50%", background: `conic-gradient(var(--violet-600) 0deg ${mobileDeg}deg, var(--mint-500) ${mobileDeg}deg 360deg)`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--surface-card)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, color: "var(--text-strong)", fontFeatureSettings: '"tnum"', lineHeight: 1, whiteSpace: "nowrap" }}>{active.length}</span>
                <span style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>건</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {([["모바일", chMobile, "var(--violet-600)"], ["수동", chManual, "var(--mint-500)"]] as const).map(([label, n, color]) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: "var(--text-body)", flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", fontFeatureSettings: '"tnum"' }}>{n}</span>
                  <span style={{ fontSize: 11.5, color: "var(--text-faint)", width: 34, textAlign: "right", fontFeatureSettings: '"tnum"' }}>{Math.round((n / chTotal) * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
          {/* 평균 만족도 (명세 §8.5) */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-hairline)", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="var(--mint-500)" stroke="var(--mint-500)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z" />
            </svg>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              평균 만족도 <b style={{ color: "var(--text-strong)" }}>{avgRating ? avgRating.toFixed(1) : "—"}</b>
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
