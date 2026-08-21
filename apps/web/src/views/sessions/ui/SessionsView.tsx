"use client";

/**
 * 설명회 운영 (명세 §6, flows ADMIN-F4) — 와이어프레임 SessionsScreen 이식(POC 복원).
 *
 * ★ POC 의 화면 구성(4개 카드)을 그대로 되살린다. 다만 **조작은 붙이지
 *   않는다**: 새 설명회·엑셀 저장은 계약에 아직 없어서, 눌러도 성공한 척
 *   보여 주느니 **비활성(disabled)** 으로 원래 자리에 두고 "API 연결 전"을 스크린리더까지 알린다.
 *   가짜 성공을 만들지 않는다.
 *
 * ★ 4개 카드(총 예약·입장 완료·입장인원·취소)와 좌측 모든 회차의 숫자는 회차 목록이 함께 주는
 *   `operationsSummary` 실집계다. 정원·예약률·좌석 원장은 운영 화면에 노출하지 않는다.
 *

 *   학생·반·담임·학부모 연락처)까지 와서 POC 의 8열(캠퍼스·단위명·학생명·반명·담임명·학부모HP·
 *   별점·후기)을 그대로 채운다. 보내기 카드의 문구·변수·바이트는 **미리보기(예시)** 이며 편집 불가다.
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

const STATUS_LABELS: Record<SeminarSessionStatus, string> = {
  DRAFT: "작성 중",
  OPEN: "예약 열림",
  CLOSED: "예약 마감",
  CANCELLED: "취소됨",
  ARCHIVED: "보관됨",
};

const STATUS_TONES: Record<SeminarSessionStatus, "neutral" | "brand" | "accent" | "danger"> = {
  DRAFT: "neutral",
  OPEN: "brand",
  CLOSED: "neutral",
  CANCELLED: "danger",
  ARCHIVED: "neutral",
};

/** 조작이 계약에 붙기 전이라는 사실을 스크린리더까지 알리는 공통 꼬리표. */
const PENDING = "API 연결 전";

/** 시각적으로 숨기고 스크린리더에만 읽히는 텍스트 — DS Button 은 aria-label 을 받지 않아, 비활성 사유를 접근名에 보탠다. */
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

export function SessionsView() {
  const sessions = useSeminarSessions();
  const lifecycle = useSessionLifecycle(sessions.reload);
  /** 열려 있는 확인 창 — null 이면 닫혀 있다. */
  const [lifecycleAction, setLifecycleAction] = useState<SessionLifecycleAction | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* 좌측 사이드바 폭 드래그 조절 (명세 §6.1: 190~460px) */
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

  // 회차별 비재원생 예약 허용 토글 — 계약 PATCH 가 있는 **활성** 조작이다(POC 비활성 링크와 다르다).
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
  /** 회차 목록이 항목마다 함께 준 실집계 — 별도 요청 없이 바로 읽는다(근사·로딩 없음). */
  const summary = session.operationsSummary;
  const scope = session.branch === null ? "전체" : BRANCH_LABELS[session.branch];

  return (
    <div data-screen-label="설명회 운영 대시보드">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, animation: "ds-fade-up var(--dur-slow) var(--ease-out) both" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "var(--tracking-caps)", fontWeight: 700, color: "var(--text-accent)", marginBottom: 6 }}>QR OPERATIONS</div>
          <h1 style={{ fontSize: "var(--text-h1)", fontWeight: 800 }}>설명회 운영</h1>
        </div>
        {/* POC 위치(우상단)에 '새 설명회'를 되살리되, 생성 계약이 붙기 전이라 비활성이다. */}
        <Button icon={<Icons.plus size={16} />} disabled>
          새 설명회<span style={SR_ONLY}> 만들기 — {PENDING}</span>
        </Button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `${sideW}px 14px 1fr`, marginTop: 20, alignItems: "start" }}>
        {/* 회차 목록 (명세 §6.1) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.options.map((option, i) => {
            const item = option.session;
            const sel = item.seminarSessionId === session.seminarSessionId;
            // 목록이 항목마다 operationsSummary 를 함께 주므로 모든 행이 자기 실집계를 쓴다.
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

        {/* 폭 조절 핸들 (명세 §6.1) */}
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
                비재원생 예약 허용 — 계약 PATCH 가 붙은 **운영 가능한** 토글이다. 저장 중에는
                disabled + "저장 중", 성공/실패는 aria-live 로 짧게 알린다. 결과를 낙관적으로 확정하지 않는다.
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
              두 조작 모두 되돌리기 어렵다 — 확인 창이 경고문을 보여 주고 문구를 직접
              입력받은 뒤에야 실행한다. 이미 종료·삭제된 회차에는 종료를 다시 걸지 않는다.
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
            실집계다(노쇼·테스트 예약 제외).

            ★ 단위가 섞여 있다. 총 예약·입장 완료·취소는 **가족 예약 건수**이고,
              입장인원만 **사람 수**다. 그래서 suffix 로 건/명을 분명히 갈라 둔다 —
              한 가족이 두 명 들어오면 입장 완료 1건에 입장인원 2명이다.

            미체크(RESERVED 건수)를 뺀 자리다. 운영 중 실제로 묻는 것은 "지금 안에 몇 명
            있나"이고, 안 온 사람 수는 총 예약에서 빼면 나온다.
          */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
            <StatCard label="총 예약" value={summary.activeCount} suffix="건" tone="brand" icon={<Icons.ticket size={15} />} delay={0} />
            <StatCard label="입장 완료" value={summary.checkedInCount} suffix="건" tone="success" icon={<Icons.check size={15} />} delay={50} />
            <StatCard label="입장인원" value={summary.attendedPeopleCount} suffix="명" tone="accent" icon={<Icons.users size={15} />} delay={100} />
            <StatCard label="취소" value={summary.cancelledCount} suffix="건" tone="danger" icon={<Icons.x size={15} />} delay={150} />
          </div>

          {/* 실시간 입장 로그 — 당일 운영 중 "방금 그 가족 처리됐나"를 새로고침 없이 본다. */}
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
        공개 진입면(`/`) 포스터 관리 — 선택 회차에 매이지 않는 **전역** 설정이라, 회차별 대시보드
        아래 전체 폭 영역에 둔다(예전 허브에 있던 패널을 여기로 옮겼다). 회차 카드가 아니다.
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
          // 창은 성공했을 때만 닫는다 — 실패하면 그 자리에서 사유를 보여 주고 다시 시도한다.
          void lifecycle.run(session, lifecycleAction).then((done) => {
            if (done) setLifecycleAction(null);
          });
        }}
      />
    </div>
  );
}

/**
 * 종료·삭제 밑줄 링크. POC 의 자리와 생김새를 그대로 쓰되 이제 실제로 동작한다.
 *
 * 누르면 곧장 실행되지 않는다 — 확인 창이 열리고, 거기서 문구를 입력해야 실행된다.
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
