"use client";

/**
 * 설명회 운영 화면. 좌측 회차 목록과 선택 회차의 운영 현황·포스터·실시간 입장 로그
 *
 * - 화면 구성(4개 카드)은 와이어프레임을 따름. 새 설명회·엑셀 저장은 계약에 없어 비활성으로
 *   원래 자리에 두고 "API 연결 전"을 스크린리더까지 알림. 성공한 척하지 않음
 * - 4개 카드(총 예약·입장 완료·입장인원·취소)와 좌측 회차 숫자는 회차 목록이 함께 주는
 *   `operationsSummary` 실집계. 정원·예약률·좌석 원장은 운영 화면에 노출하지 않음
 */

import { useMemo, useState } from "react";
import {
  LiveCheckInLog,
  SessionLifecycleDialog,
  useGuestBookingToggle,
  useSeminarSessions,
  useSessionLifecycle,
  type SessionLifecycleAction,
} from "@/features/admin-overview";
import { PosterAdminPanel } from "@/features/admin-poster";
import {
  BRANCH_LABELS,
  type SeminarSessionOption,
  type SeminarSessionStatus,
} from "@/shared/api";
import { fmtDateTimeShort, fmtSessionDate } from "@/shared/lib/format";
import { SEMINAR_LOCATION } from "@/shared/lib/seminar";
import { Badge, Button, Card, Icons, StatCard, Switch } from "@/shared/ui";

/**
 * 회차 상태 표시 문구
 */
const STATUS_LABELS: Record<SeminarSessionStatus, string> = {
  DRAFT: "작성 중",
  OPEN: "예약 열림",
  CLOSED: "예약 마감",
  CANCELLED: "취소됨",
  ARCHIVED: "보관됨",
};

/**
 * 회차 상태 배지 색조
 */
const STATUS_TONES: Record<SeminarSessionStatus, "neutral" | "brand" | "accent" | "danger"> = {
  DRAFT: "neutral",
  OPEN: "brand",
  CLOSED: "neutral",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
};

/**
 * 조작이 계약에 붙기 전이라는 사실을 스크린리더까지 알리는 공통 꼬리표
 */
const PENDING = "API 연결 전";

/**
 * 시각적으로 숨기고 스크린리더에만 읽히는 텍스트 — DS Button 은 aria-label 을 받지 않아, 비활성 사유를 접근名에 보탬
 */
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * 설명회 운영 화면
 */
export function SessionsView() {
  const sessions = useSeminarSessions();
  const lifecycle = useSessionLifecycle(sessions.reload);
  // 열려 있는 확인 창 — null 이면 닫혀 있음
  const [lifecycleAction, setLifecycleAction] = useState<SessionLifecycleAction | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 좌측 사이드바 폭 드래그 조절. 190~460px
  const [sideW, setSideW] = useState(300);
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const sx = e.clientX;
    const sw = sideW;
    const mv = (ev: MouseEvent) => setSideW(Math.max(190, Math.min(460, sw + ev.clientX - sx)));
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const selected = useMemo<SeminarSessionOption | null>(
    () => sessions.options.find((o) => o.session.seminarSessionId === selectedId) ?? sessions.options[0] ?? null,
    [sessions.options, selectedId],
  );

  // 회차별 비재원생 예약 허용 토글 — 계약 PATCH 가 있는 실제 조작임
  const guestToggle = useGuestBookingToggle(sessions.reload);


  if (sessions.loading) {
    return (
      <div data-screen-label="설명회 운영 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>설명회를 불러오는 중이에요…</div>
      </div>
    );
  }

  if (sessions.error !== null) {
    return (
      <div data-screen-label="설명회 운영 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
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
      <div data-screen-label="설명회 운영 대시보드">
        <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        <div style={{ padding: "60px 0", textAlign: "center", color: "var(--text-faint)" }}>등록된 설명회가 없어요.</div>
      </div>
    );
  }

  const session = selected.session;
  // 회차 목록이 항목마다 함께 준 실집계 — 별도 요청 없이 바로 읽음(근사·로딩 없음)
  const summary = session.operationsSummary;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];

  return (
    <div data-screen-label="설명회 운영 대시보드">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>QR OPERATIONS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        </div>
        {/* 우상단 '새 설명회'. 생성 계약이 없어 비활성 */}
        <Button icon={<Icons.plus size={16} />} disabled>
          새 설명회<span style={SR_ONLY}> 만들기 — {PENDING}</span>
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `${sideW}px 14px 1fr`, marginTop: 20, alignItems: "start" }}>
        {/* 회차 목록 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.options.map((option, i) => {
            const item = option.session;
            const sel = item.seminarSessionId === session.seminarSessionId;
            // 목록이 항목마다 operationsSummary 를 함께 주므로 모든 행이 자기 실집계를 씀
            const rowActive = item.operationsSummary.activeCount;
            const rowCheckedIn = item.operationsSummary.checkedInCount;
            return (
              <button
                key={item.seminarSessionId}
                type="button"
                aria-pressed={sel}
                onClick={() => {
                  setSelectedId(item.seminarSessionId);
                  guestToggle.clearStatus();
                }}
                style={{ width: "100%", textAlign: "left", fontFamily: "inherit", padding: "16px 18px", borderRadius: "var(--radius-lg)", cursor: "pointer", background: sel ? "var(--surface-brand-soft)" : "var(--surface-card)", color: "var(--text-body)", border: sel ? "1.5px solid var(--violet-800)" : "1px solid var(--border-hairline)", boxShadow: sel ? "var(--shadow-accent-glow)" : "var(--shadow-card)", transform: sel ? "scale(1.02)" : "scale(1)", transition: "all var(--dur-base) var(--ease-spring)", animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${Math.min(i, 10) * 70}ms both` }}
              >
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: sel ? "var(--text-brand)" : "var(--text-strong)", lineHeight: 1.4 }}>
                  {option.seminarTitle}
                </div>
                <div style={{ fontSize: 12, marginTop: 5, color: "var(--text-muted)" }}>
                  {fmtSessionDate(new Date(item.startsAt))} · {item.branch === null ? "전체" : BRANCH_LABELS[item.branch]}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 11.5, color: sel ? "var(--text-brand)" : "var(--text-muted)", fontFeatureSettings: '"tnum"' }}>
                  <span>예약 <b>{rowActive.toLocaleString("ko-KR")}</b>건</span>
                  <span aria-hidden="true">·</span>
                  <span>입장 <b>{rowCheckedIn.toLocaleString("ko-KR")}</b>건</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 폭 조절 핸들 */}
        <div onMouseDown={startDrag} title="드래그하여 폭 조절" style={{ cursor: "col-resize", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ width: 4, height: 52, borderRadius: 2, background: "var(--gray-3)" }} />
        </div>

        {/* 선택 회차 대시보드 */}
        <div key={session.seminarSessionId} style={{ display: "flex", flexDirection: "column", gap: 14, animation: "ds-fade-up var(--dur-base) var(--ease-out) both" }}>
          <Card padding="20px 24px" style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 800 }}>{selected.seminarTitle}</h2>
                <Badge tone={STATUS_TONES[session.status]} size="sm">
                  {STATUS_LABELS[session.status]}
                </Badge>
              </div>
              <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  <Icons.calendar size={13} /> {fmtDateTimeShort(new Date(session.startsAt))}
                </span>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  <Icons.mapPin size={13} /> {SEMINAR_LOCATION}
                </span>
                <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                  <Icons.users size={13} /> {scope}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>
                예약 창구 {fmtDateTimeShort(new Date(session.bookingOpensAt))} ~ {fmtDateTimeShort(new Date(session.bookingClosesAt))}
              </div>
              {/*
                비재원생 예약 허용 — 계약 PATCH 가 붙은 운영 가능한 토글임. 저장 중에는
                disabled + "저장 중", 성공/실패는 aria-live 로 짧게 알림. 결과를 낙관적으로 확정하지 않음
              */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                <Switch
                  checked={session.guestBookingEnabled}
                  disabled={guestToggle.savingId === session.seminarSessionId}
                  onChange={(next) => void guestToggle.toggle(session, next)}
                  label="비재원생 예약 허용"
                />
                <span
                  role="status"
                  aria-live="polite"
                  style={{ fontSize: 11.5, color: "var(--text-faint)", fontWeight: 600 }}
                >
                  {guestToggle.savingId === session.seminarSessionId
                    ? "저장 중…"
                    : guestToggle.status !== null
                      ? guestToggle.status
                      : session.guestBookingEnabled
                        ? "허용됨"
                        : "허용 안 함"}
                </span>
                {guestToggle.error !== null && (
                  <span role="alert" style={{ fontSize: 11.5, color: "var(--status-danger)", fontWeight: 600 }}>
                    {guestToggle.error}
                  </span>
                )}
              </div>
            </div>
            {/*
              두 조작 모두 되돌리기 어려움 — 확인 창이 경고문을 보여 주고 문구를 직접
              입력받은 뒤에야 실행함. 이미 종료·삭제된 회차에는 종료를 다시 걸지 않음
            */}
            <div style={{ display: "flex", gap: 14 }}>
              <LifecycleLink
                icon={<Icons.check size={12} />}
                label="설명회 종료"
                tone="var(--text-muted)"
                disabled={lifecycle.busy || session.status === "CLOSED" || session.status === "ARCHIVED"}
                onClick={() => { lifecycle.clear(); setLifecycleAction("CLOSE"); }}
              />
              <LifecycleLink
                icon={<Icons.trash size={12} />}
                label="삭제"
                tone="var(--status-danger)"
                disabled={lifecycle.busy}
                onClick={() => { lifecycle.clear(); setLifecycleAction("ARCHIVE"); }}
              />
            </div>
          </Card>

          {/*
            현황 스탯 — 총 예약·입장 완료·입장인원·취소. 목록 항목의 operationsSummary
            실집계임(노쇼·테스트 예약 제외)

            단위가 섞여 있음. 총 예약·입장 완료·취소는 가족 예약 건수이고,
              입장인원만 사람 수임. 그래서 suffix 로 건/명을 분명히 갈라 둠 —
              한 가족이 두 명 들어오면 입장 완료 1건에 입장인원 2명임

            미체크(RESERVED 건수)를 뺀 자림. 운영 중 실제로 묻는 것은 "지금 안에 몇 명
            있나"이고, 안 온 사람 수는 총 예약에서 빼면 나옴
          */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard label="총 예약" value={summary.activeCount} suffix="건" tone="brand" icon={<Icons.ticket size={15} />} delay={0} />
            <StatCard label="입장 완료" value={summary.checkedInCount} suffix="건" tone="success" icon={<Icons.check size={15} />} delay={50} />
            <StatCard label="입장인원" value={summary.attendedPeopleCount} suffix="명" tone="accent" icon={<Icons.users size={15} />} delay={100} />
            <StatCard label="취소" value={summary.cancelledCount} suffix="건" tone="danger" icon={<Icons.x size={15} />} delay={150} />
          </div>

          {/* 실시간 입장 로그 — 당일 운영 중 "방금 그 가족 처리됐나"를 새로고침 없이 봄 */}
          <Card padding="14px 16px">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Icons.monitor size={15} style={{ color: "var(--mint-600)" }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-strong)" }}>실시간 입장 로그</span>
              <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>3초마다 갱신 · 최근 300건</span>
            </div>
            <LiveCheckInLog seminarSessionId={session.seminarSessionId} />
          </Card>

        </div>
      </div>

      {/*
        공개 진입면(`/`) 포스터 관리 — 선택 회차에 매이지 않는 전역 설정이라, 회차별 대시보드
        아래 전체 폭 영역에 둠. 회차 카드가 아님
      */}
      <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border-hairline)", animation: "ds-fade-up var(--dur-slow) var(--ease-out) 120ms both" }}>
        <PosterAdminPanel />
      </div>

      <SessionLifecycleDialog
        action={lifecycleAction}
        sessionLabel={`${selected.seminarTitle} · ${fmtSessionDate(new Date(session.startsAt))}`}
        busy={lifecycle.busy}
        error={lifecycle.error}
        onCancel={() => { setLifecycleAction(null); lifecycle.clear(); }}
        onConfirm={() => {
          if (lifecycleAction === null) return;
          // 창은 성공했을 때만 닫음 — 실패하면 그 자리에서 사유를 보여 주고 다시 시도함
          void lifecycle.run(session, lifecycleAction).then((done) => {
            if (done) setLifecycleAction(null);
          });
        }}
      />
    </div>
  );
}

/**
 * 회차 종료·삭제 밑줄 링크
 *
 * 누르면 곧장 실행되지 않음 — 확인 창이 열리고, 거기서 문구를 입력해야 실행됨
 */
function LifecycleLink(
  { icon, label, tone, disabled, onClick }:
  { icon: React.ReactNode; label: string; tone: string; disabled: boolean; onClick: () => void },
) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: 0,
        background: "none",
        border: "none",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 600,
        color: tone,
        textDecoration: "underline",
        textUnderlineOffset: 3,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {icon} {label}
    </button>
  );
}
