"use client";

/**
 * 운영 통계 — 정원·예약률이 아니라 학생 → 가족 → 실제 참석 학부모의 절대 규모를 보여 준다.
 * 같은 세 수치를 요약·단위·예약 채널에서 반복해, 형제자매 때문에 학생 행 수와 좌석 수가
 * 달라지는 이유를 한 화면에서 비교할 수 있게 한다.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useSeminarSessions, useSessionStatistics } from "@/features/admin-overview";
import type { ChannelStat, SessionStatistics, UnitStat } from "@/features/admin-overview";
import { BRANCH_LABELS, BRANCH_OPTIONS, type Branch, type ParticipationMonitoring, type SeminarSessionOption } from "@/shared/api";
import { fmtSessionDate } from "@/shared/lib/format";
import { Button, Card, Icons, Select, Tag } from "@/shared/ui";

const STATS_STYLES = `
  .npr-stats-root { width: 100%; min-width: 0; box-sizing: border-box; }
  .npr-stats-header, .npr-stats-header > * { min-width: 0; }
  .npr-stats-controls { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; max-width: 100%; }
  .npr-stats-select { width: 380px; max-width: 100%; }
  .npr-stats-tags { display: flex; flex-wrap: wrap; gap: 6px; }

  .npr-stats-monitoring { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
  .npr-stats-operations { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 12px; }
  .npr-stats-panels { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, .9fr); gap: 14px; margin-top: 14px; align-items: start; }
  .npr-stats-panels > * { min-width: 0; }

  .npr-stats-unit-head, .npr-stats-unit-row {
    display: grid;
    grid-template-columns: minmax(72px, 1.15fr) repeat(3, minmax(70px, .8fr));
    align-items: center;
    gap: 10px;
  }
  .npr-stats-unit-head { padding: 0 10px 9px; color: var(--text-faint); font-size: 11px; font-weight: 700; }
  .npr-stats-unit-row { min-height: 48px; padding: 0 10px; border-top: 1px solid var(--border-hairline); }
  .npr-stats-unit-row[data-total="true"] { background: var(--surface-brand-soft); border-radius: var(--radius-sm); border-top-color: transparent; }
  .npr-stats-num { text-align: right; font-feature-settings: "tnum"; white-space: nowrap; }

  .npr-stats-channel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .npr-stats-channel-metrics { display: grid; grid-template-columns: 1fr auto; gap: 7px 12px; margin-top: 12px; }

  @media (max-width: 767px) {
    .npr-stats-controls { flex: 1 1 100%; align-items: stretch; }
    .npr-stats-select { width: 100%; }
    .npr-stats-select button { height: auto !important; min-height: 46px; padding-top: 10px !important; padding-bottom: 10px !important; text-align: left; }
    .npr-stats-panels { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 560px) {
    .npr-stats-monitoring, .npr-stats-operations { grid-template-columns: minmax(0, 1fr); }
    .npr-stats-unit-head, .npr-stats-unit-row { grid-template-columns: minmax(70px, 1fr) repeat(3, minmax(58px, .72fr)); gap: 6px; }
  }
  @media (max-width: 380px) {
    .npr-stats-channel-grid { grid-template-columns: minmax(0, 1fr); }
  }
`;

function StatsScreen({ children }: { children: ReactNode }) {
  return (
    <div className="npr-stats-root" data-screen-label="참가자 운영 통계">
      <style>{STATS_STYLES}</style>
      {children}
    </div>
  );
}

function sessionLabel(option: SeminarSessionOption): string {
  const { session, seminarTitle } = option;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];
  return `${seminarTitle} · ${fmtSessionDate(new Date(session.startsAt))} · ${scope}`;
}

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

function displayNumber(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("ko-KR");
}

export function StatsView() {
  const sessions = useSeminarSessions();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [branch, setBranch] = useState<Branch | null>(null);

  const selected = useMemo(
    () => sessions.options.find((option) => option.session.seminarSessionId === sessionId) ?? sessions.options[0] ?? null,
    [sessions.options, sessionId],
  );
  const sessionBranch = selected?.session.branch ?? null;
  const effectiveBranch = sessionBranch === null ? branch : null;
  const overview = useSessionStatistics(selected?.session.seminarSessionId ?? null, effectiveBranch);

  if (sessions.loading) {
    return (
      <StatsScreen>
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <Pending>설명회를 불러오는 중이에요…</Pending>
      </StatsScreen>
    );
  }

  if (sessions.error !== null) {
    return (
      <StatsScreen>
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <div role="alert" style={{ padding: "60px 0", textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "var(--text-body)", margin: "0 0 12px" }}>{sessions.error}</p>
          <Button variant="secondary" size="sm" onClick={sessions.reload}>다시 시도</Button>
        </div>
      </StatsScreen>
    );
  }

  if (selected === null) {
    return (
      <StatsScreen>
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
        <Pending>등록된 설명회가 없어요.</Pending>
      </StatsScreen>
    );
  }

  const stats = overview.stats;
  const scopeLabel = effectiveBranch === null ? "전체" : BRANCH_LABELS[effectiveBranch];

  return (
    <StatsScreen>
      <div className="npr-stats-header" style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>ANALYTICS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>운영 통계</h1>
          <p style={{ margin: "7px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            학생 행과 가족 예약을 구분해 실제 참석 학부모 수를 확인합니다.
          </p>
        </div>
        <span style={{ flex: 1 }} />
        <div className="npr-stats-controls">
          <div className="npr-stats-select">
            <Select
              options={sessions.options.map((option) => ({ label: sessionLabel(option), value: option.session.seminarSessionId }))}
              value={selected.session.seminarSessionId}
              onChange={setSessionId}
              style={{ width: "100%" }}
            />
          </div>
          {sessionBranch === null ? (
            <div className="npr-stats-tags" aria-label="캠퍼스 필터">
              <Tag selected={branch === null} onClick={() => setBranch(null)} style={{ height: 34 }}>전체</Tag>
              {BRANCH_OPTIONS.map((option) => (
                <Tag key={option.value} selected={branch === option.value} onClick={() => setBranch(option.value)} style={{ height: 34 }}>
                  {option.label}
                </Tag>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}><b>{BRANCH_LABELS[sessionBranch]}</b> 전용 회차예요.</span>
          )}
        </div>
      </div>

      {overview.error !== null && (
        <Card padding="14px 18px" style={{ marginTop: 18, border: "1px solid var(--status-danger-soft)" }}>
          <div role="alert" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--status-danger)", flex: 1 }}>{overview.error}</span>
            <Button variant="secondary" size="sm" onClick={overview.reload}>다시 시도</Button>
          </div>
        </Card>
      )}

      {stats !== null && stats.source === "derived" && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", fontSize: 12, color: "var(--text-muted)" }}>
          <Icons.alertTriangle size={14} style={{ color: "var(--status-warning)", flexShrink: 0 }} />
          참가자 집계 API 배포 전이에요. 운영 상태만 표시하고 학생·가족·참가자 수는 임의 추정하지 않습니다.
        </div>
      )}

      <div style={{ opacity: overview.loading ? 0.55 : 1, transition: "opacity var(--dur-fast)" }}>
        {stats === null ? (
          <Pending>{overview.error === null ? "집계를 불러오는 중이에요…" : "집계를 불러오지 못했어요."}</Pending>
        ) : (
          <StatsBody stats={stats} scopeLabel={scopeLabel} />
        )}
      </div>
    </StatsScreen>
  );
}

function StatsBody({ stats, scopeLabel }: { stats: SessionStatistics; scopeLabel: string }) {
  const monitoring = stats.monitoring;
  return (
    <>
      <section aria-labelledby="monitoring-title">
        <div id="monitoring-title" style={{ marginTop: 20, fontSize: 12, fontWeight: 700, color: "var(--text-faint)" }}>
          {scopeLabel} 참가 규모
        </div>
        <div className="npr-stats-monitoring">
          <MetricCard label="해당 학생" value={monitoring?.studentCount ?? null} suffix="명" icon={<Icons.users size={16} />} tone="neutral" delay={0} />
          <MetricCard label="형제원생 제외" value={monitoring?.familyBookingCount ?? null} suffix="가족" icon={<Icons.ticket size={16} />} tone="brand" delay={50} />
          <MetricCard label="실 참가자" value={monitoring?.attendeeCount ?? null} suffix="명" icon={<Icons.userCheck size={16} />} tone="success" delay={100} featured />
        </div>
      </section>

      <section aria-label="예약 운영 상태" className="npr-stats-operations">
        <MetricCard label="입장 완료" value={stats.checkedInCount} suffix="건" icon={<Icons.userCheck size={15} />} tone="success" delay={120} compact />
        <MetricCard label="미입장" value={stats.reservedCount} suffix="건" icon={<Icons.clock size={15} />} tone="accent" delay={150} compact />
        <MetricCard label="취소" value={stats.cancelledCount} suffix="건" icon={<Icons.x size={15} />} tone="danger" delay={180} compact />
      </section>

      <div className="npr-stats-panels">
        <Card padding="20px 22px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 200ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <Icons.barChart size={16} style={{ color: "var(--violet-800)" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)" }}>단위별 참가 규모</span>
            <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>비율이 아닌 절대 인원입니다.</span>
          </div>
          {stats.units === null ? (
            <Pending compact>단위별 참가자 집계는 API 연결 후 표시돼요.</Pending>
          ) : stats.units.length === 0 ? (
            <Pending compact>표시할 단위가 없어요.</Pending>
          ) : (
            <UnitTable rows={stats.units} />
          )}
        </Card>

        <Card padding="20px 22px" style={{ animation: "ds-fade-up var(--dur-slow) var(--ease-out) 260ms both" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <Icons.pieChart size={16} style={{ color: "var(--mint-600)" }} />
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text-strong)" }}>예약 채널별 참가 규모</span>
          </div>
          {stats.channelStats === null ? (
            <Pending compact>채널별 참가자 집계는 API 연결 후 표시돼요.</Pending>
          ) : stats.channelStats.length === 0 ? (
            <Pending compact>표시할 예약 채널이 없어요.</Pending>
          ) : (
            <div className="npr-stats-channel-grid">
              {stats.channelStats.map((channel) => <ChannelCard key={channel.channel} channel={channel} />)}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

const TONE_COLORS = {
  neutral: "var(--text-muted)",
  brand: "var(--violet-800)",
  success: "var(--mint-600)",
  accent: "var(--text-accent)",
  danger: "var(--status-danger)",
} as const;

function MetricCard({ label, value, suffix, icon, tone, delay, featured = false, compact = false }: {
  label: string;
  value: number | null;
  suffix: string;
  icon: ReactNode;
  tone: keyof typeof TONE_COLORS;
  delay: number;
  featured?: boolean;
  compact?: boolean;
}) {
  return (
    <Card
      padding={compact ? "16px 18px" : "20px 22px"}
      style={{
        minWidth: 0,
        border: featured ? "1px solid var(--border-brand)" : undefined,
        background: featured ? "linear-gradient(145deg, var(--surface-card), var(--surface-brand-soft))" : undefined,
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: TONE_COLORS[tone], fontSize: 12.5, fontWeight: 700 }}>
        {icon}<span>{label}</span>
      </div>
      <div style={{ marginTop: compact ? 8 : 12, display: "flex", alignItems: "baseline", gap: 5, minWidth: 0 }}>
        <strong style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: compact ? 25 : 34, lineHeight: 1, color: TONE_COLORS[tone], fontFeatureSettings: '"tnum"' }}>
          {displayNumber(value)}
        </strong>
        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{suffix}</span>
      </div>
    </Card>
  );
}

function UnitTable({ rows }: { rows: UnitStat[] }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="npr-stats-unit-head" aria-hidden>
        <span>단위</span><span className="npr-stats-num">학생</span><span className="npr-stats-num">가족</span><span className="npr-stats-num">참가자</span>
      </div>
      {rows.map((row, index) => {
        const isTotal = row.unit === "ALL" || row.unit === "전체";
        return (
          <div key={row.unit} className="npr-stats-unit-row" data-total={isTotal} style={{ animation: `ds-fade-up var(--dur-base) var(--ease-out) ${index * 35}ms both` }}>
            <strong style={{ fontSize: 12.5, color: "var(--text-strong)" }}>{UNIT_GROUP_LABELS[row.unit] ?? row.unit}</strong>
            <Value value={row.monitoring?.studentCount ?? null} />
            <Value value={row.monitoring?.familyBookingCount ?? null} />
            <Value value={row.monitoring?.attendeeCount ?? null} emphasized />
          </div>
        );
      })}
    </div>
  );
}

function ChannelCard({ channel }: { channel: ChannelStat }) {
  const label = channel.channel === "MOBILE" ? "모바일" : "수동";
  const monitoring: ParticipationMonitoring | null = channel.monitoring;
  return (
    <div style={{ minWidth: 0, padding: "13px 14px", borderRadius: "var(--radius-md)", background: "var(--surface-sunken)", border: "1px solid var(--border-hairline)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: channel.channel === "MOBILE" ? "var(--violet-700)" : "var(--mint-500)" }} />
        <strong style={{ fontSize: 13.5, color: "var(--text-strong)" }}>{label}</strong>
      </div>
      <div className="npr-stats-channel-metrics">
        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>해당 학생</span><Value value={monitoring?.studentCount ?? null} />
        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>형제 제외</span><Value value={monitoring?.familyBookingCount ?? null} />
        <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>참가자수</span><Value value={monitoring?.attendeeCount ?? null} emphasized />
      </div>
    </div>
  );
}

function Value({ value, emphasized = false }: { value: number | null; emphasized?: boolean }) {
  return (
    <span className="npr-stats-num" style={{ fontSize: 13, fontWeight: emphasized ? 800 : 700, color: emphasized ? "var(--violet-800)" : "var(--text-body)" }}>
      {displayNumber(value)}<span style={{ marginLeft: 2, fontSize: 10.5, fontWeight: 500, color: "var(--text-faint)" }}>명</span>
    </span>
  );
}

function Pending({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return (
    <div style={{ padding: compact ? "28px 8px" : "60px 8px", textAlign: "center", color: "var(--text-faint)", fontSize: 12.5, lineHeight: 1.6 }}>
      {compact && <Icons.clock size={18} style={{ color: "var(--gray-3)", marginBottom: 6 }} />}
      <div>{children}</div>
    </div>
  );
}
