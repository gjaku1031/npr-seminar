"use client";

/**
 * 통계 (명세 §8, flows ADMIN-F6) — 와이어프레임 StatsScreen 이식(POC 복원): 회차 × 캠퍼스 필터.
 *
 * ★ POC 구성을 되살린다: 요약 5개 카드 · 단위별 예약률·참석률 막대 · 채널(모바일/수동) 도넛 ·
 *   만족도. 데이터는 `useSessionStatistics` → statistics 서버 집계에서 온다(요약·단위·채널·설문).
 *
 * ★ 아직 안 붙은 배포(GET .../statistics 404/501)만 대비해 어댑터가 **graceful fallback** 으로
 *   계약이 이미 주는 값만 합성한다: 5개 카드와 만족도는 실데이터로 채우고, **단위·채널 분해는
 *   만들 수 없어**(예약 목록에 unitGroup·bookingSource 필터가 없다) 그 두 패널만 "연결 예정"으로
 *   정직하게 비운다. 서버 응답일 때는 그 안내 없이 POC 레이아웃을 그대로 채운다.
 */

import { useMemo, useState } from "react";
import { useSeminarSessions, useSessionStatistics } from "@/features/admin-overview";
import type { SessionStatistics, UnitStat } from "@/features/admin-overview";
import { BRANCH_LABELS, BRANCH_OPTIONS, type Branch, type SeminarSessionOption } from "@/shared/api";
import { fmtSessionDate } from "@/shared/lib/format";
import { Button, Card, Icons, Select, StatCard, Tag } from "@/shared/ui";

function sessionLabel(option: SeminarSessionOption): string {
  const { session, seminarTitle } = option;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];
  return `${seminarTitle} · ${fmtSessionDate(new Date(session.startsAt))} · ${scope}`;
}

/**
 * 통계 API 의 단위 그룹(StatisticsUnitGroup enum) → POC 라벨. 서버는 ELEMENTARY·MIDDLE_1 같은
 * enum 을 주므로, POC 의 전체·초등·중1… 표기로만 바꾼다(값·순서는 서버가 정한다).
 */
const UNIT_GROUP_LABELS: Record<string, string> = {
  ALL: "전체",
  ELEMENTARY: "초등",
  MIDDLE_1: "중1",
  MIDDLE_2: "중2",
  MIDDLE_3: "중3",
  SPECIAL_PURPOSE: "특목",
  HIGH: "고등",
  SCIENCE: "과학",
};

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export function StatsView() {
  const sessions = useSeminarSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);

  const selected = useMemo(
    () => sessions.options.find((o) => o.session.seminarSessionId === sessionId) ?? sessions.options[0] ?? null,
    [sessions.options, sessionId],
  );

  /**
   * 캠퍼스 전용 회차에 다른 캠퍼스를 걸면 언제나 0이다 — 고를 여지를 주지 않고, 그 회차는 필터
   * 없이(회차 전체로) 본다. 원장/집계가 이미 그 캠퍼스만의 값이라 굳이 갈아탈 이유가 없다.
   */
  const sessionBranch = selected?.session.branch ?? null;
  const effectiveBranch = sessionBranch === null ? branch : null;

  const overview = useSessionStatistics(selected?.session.seminarSessionId ?? null, effectiveBranch);

  if (sessions.loading) {
    return (
      <div data-screen-label="통계 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>설명회를 불러오는 중이에요…</div>
      </div>
    );
  }

  if (sessions.error !== null) {
    return (
      <div data-screen-label="통계 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <div role="alert" style={{ padding: "60px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "var(--text-body)", margin: "0 0 12px" }}>{sessions.error}</p>
          <Button variant="secondary" size="sm" onClick={sessions.reload}>
            다시 시도
          </Button>
        </div>
      </div>
    );
  }

  if (selected === null) {
    return (
      <div data-screen-label="통계 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>등록된 설명회가 없어요.</div>
      </div>
    );
  }

  const stats = overview.stats;
  const scopeLabel = effectiveBranch === null ? "전체" : BRANCH_LABELS[effectiveBranch];

  return (
    <div data-screen-label="통계 대시보드">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>ANALYTICS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
          <Select
            options={sessions.options.map((o) => ({ label: sessionLabel(o), value: o.session.seminarSessionId }))}
            value={selected.session.seminarSessionId}
            onChange={setSessionId}
            style={{ width: 380 }}
          />
          {sessionBranch === null ? (
            <div style={{ display: "flex", gap: 6 }}>
              <Tag selected={branch === null} onClick={() => setBranch(null)} style={{ height: 34 }}>
                전체
              </Tag>
              {BRANCH_OPTIONS.map((option) => (
                <Tag key={option.value} selected={branch === option.value} onClick={() => setBranch(option.value)} style={{ height: 34 }}>
                  {option.label}
                </Tag>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <b>{BRANCH_LABELS[sessionBranch]}</b> 전용 회차예요.
            </span>
          )}
        </div>
      </div>

      {overview.error !== null && (
        <Card padding="14px 18px" style={{ marginTop: 18, border: "1px solid var(--status-danger-soft)" }}>
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 13, color: "var(--status-danger)", flex: 1 }}>{overview.error}</span>
            <Button variant="secondary" size="sm" onClick={overview.reload}>
              다시 시도
            </Button>
          </div>
        </Card>
      )}

      {/* 집계 API 연결 전이면 무엇이 실데이터고 무엇이 연결 예정인지 먼저 밝힌다. */}
      {stats !== null && stats.source === "derived" && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", fontSize: 12, color: "var(--text-muted)" }}>
          <Icons.alertTriangle size={14} style={{ color: "var(--status-warning)", flexShrink: 0 }} />
          집계 API 연결 전이에요 — 아래 <b>요약 5개 · 만족도</b>는 실데이터, <b>단위·채널 분석</b>은 연결 후 표시돼요.
        </div>
      )}

      <div style={{ opacity: overview.loading ? 0.55 : 1, transition: "opacity var(--dur-fast)" }}>
        {stats === null ? (
          <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>
            {overview.error === null ? "집계를 불러오는 중이에요…" : "집계를 불러오지 못했어요."}
          </div>
        ) : (
          <StatsBody stats={stats} scopeLabel={scopeLabel} />
        )}
      </div>
    </div>
  );
}

function StatsBody({ stats, scopeLabel }: { stats: SessionStatistics; scopeLabel: string }) {
  const attendRate = percent(stats.checkedInCount, stats.activeCount);
  const noShowRate = percent(stats.noShowCount, stats.activeCount);

  return (
    <>
      {/* 요약 5개 카드 — POC 그대로. 전부 실데이터(가족 예약 건수 기준). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginTop: 20 }}>
        <StatCard label={`전체 인원 (${scopeLabel})`} value={stats.eligibleStudentCount} suffix="명" tone="neutral" icon={<Icons.users size={15} />} delay={0} />
        <StatCard label="총 예약" value={stats.activeCount} suffix="건" tone="brand" icon={<Icons.ticket size={15} />} delay={50} />
        <StatCard label="입장 완료" value={stats.checkedInCount} suffix="명" tone="success" icon={<Icons.userCheck size={15} />} delay={100} />
        <StatCard label="참석률" value={attendRate} suffix="%" tone="accent" icon={<Icons.trendingUp size={15} />} delay={150} />
        <StatCard label="노쇼율" value={noShowRate} suffix="%" tone="neutral" icon={<Icons.alertTriangle size={15} />} delay={200} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginTop: 14, alignItems: "start" }}>
        {/* 단위별 예약률·참석률 */}
        <Card padding="20px 22px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 200ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <Icons.barChart size={16} style={{ color: "var(--violet-800)" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)" }}>단위별 예약률 · 참석률</span>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>예약률 = 예약/단위 인원 · 참석률 = 참석/예약</span>
          </div>
          {stats.units === null ? (
            <Pending>단위별 집계는 통계 API 연결 후 표시돼요.</Pending>
          ) : stats.units.length === 0 ? (
            <Pending>표시할 단위가 없어요.</Pending>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              {stats.units.map((row, i) => (
                <BarPair key={row.unit} row={row} i={i} />
              ))}
            </div>
          )}
        </Card>

        {/* 채널별 예약 (모바일/수동) + 만족도 */}
        <Card padding="20px 22px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 260ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Icons.pieChart size={16} style={{ color: "var(--mint-600)" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)" }}>채널별 예약</span>
          </div>
          {stats.channels === null ? (
            <Pending>채널별 집계는 통계 API 연결 후 표시돼요.</Pending>
          ) : (
            <ChannelDonut mobileCount={stats.channels.mobileCount} manualCount={stats.channels.manualCount} />
          )}

          {/* 만족도 — 설문 summary(서버 집계). 회차 전체 기준이라 캠퍼스를 걸어도 그대로다. */}
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border-hairline)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icons.star size={14} style={{ color: "var(--mint-500)" }} />
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              평균 만족도{" "}
              <b style={{ color: "var(--text-strong)" }}>{stats.survey.averageRating === null ? "—" : stats.survey.averageRating.toFixed(1)}</b>
              <span style={{ color: "var(--text-faint)" }}> · 응답 {stats.survey.responseCount}건</span>
            </span>
          </div>
        </Card>
      </div>
    </>
  );
}

function BarPair({ row, i }: { row: UnitStat; i: number }) {
  const resRate = percent(row.activeCount, row.eligibleStudentCount);
  const entRate = percent(row.checkedInCount, row.activeCount);
  const isTotal = row.unit === "ALL";
  const label = UNIT_GROUP_LABELS[row.unit] ?? row.unit;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 1fr", gap: 14, alignItems: "center", animation: `ds-fade-up var(--dur-base) var(--ease-out) ${i * 40}ms both` }}>
      <span style={{ fontSize: 12.5, fontWeight: isTotal ? 800 : 600, color: "var(--text-strong)" }}>{label}</span>
      <span>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-faint)", marginBottom: 3 }}>
          <span>예약률</span>
          <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: "var(--violet-800)" }}>
            {resRate}% <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({row.activeCount}/{row.eligibleStudentCount})</span>
          </span>
        </span>
        <span style={{ display: "block", height: 8, borderRadius: 4, background: "var(--gray-2)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(100, resRate)}%`, background: "var(--violet-600)", transition: "width var(--dur-hero) var(--ease-smooth)" }} />
        </span>
      </span>
      <span>
        <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-faint)", marginBottom: 3 }}>
          <span>참석률</span>
          <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700, color: "var(--mint-600)" }}>
            {entRate}% <span style={{ fontWeight: 400, color: "var(--text-faint)" }}>({row.checkedInCount}/{row.activeCount})</span>
          </span>
        </span>
        <span style={{ display: "block", height: 8, borderRadius: 4, background: "var(--gray-2)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.min(100, entRate)}%`, background: "var(--mint-500)", transition: "width var(--dur-hero) var(--ease-smooth)" }} />
        </span>
      </span>
    </div>
  );
}

function ChannelDonut({ mobileCount, manualCount }: { mobileCount: number; manualCount: number }) {
  const total = mobileCount + manualCount;
  const denom = total || 1;
  const mobileDeg = (mobileCount / denom) * 360;
  const rows: Array<[string, number, string]> = [
    ["모바일", mobileCount, "var(--violet-600)"],
    ["수동", manualCount, "var(--mint-500)"],
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ width: 120, height: 120, borderRadius: "50%", background: `conic-gradient(var(--violet-600) 0deg ${mobileDeg}deg, var(--mint-500) ${mobileDeg}deg 360deg)`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--surface-card)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 21, color: "var(--text-strong)", fontFeatureSettings: '"tnum"', lineHeight: 1, whiteSpace: "nowrap" }}>{total}</span>
          <span style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>건</span>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(([label, n, color]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--text-body)", flex: 1 }}>{label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-strong)", fontFeatureSettings: '"tnum"' }}>{n}</span>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)", width: 34, textAlign: "right", fontFeatureSettings: '"tnum"' }}>{percent(n, denom)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 집계 엔드포인트 연결 전 패널을 정직하게 비우는 자리 표시. */
function Pending({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: "32px 8px", textAlign: "center", color: "var(--text-faint)", fontSize: 12.5, lineHeight: 1.6 }}>
      <Icons.clock size={18} style={{ color: "var(--gray-3)", marginBottom: 6 }} />
      <div>{children}</div>
    </div>
  );
}
