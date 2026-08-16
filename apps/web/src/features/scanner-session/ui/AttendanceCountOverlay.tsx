"use client";

/**
 * 인원 선택 오버레이 — 2명 예약이 게이트에 도착했을 때 실제로 몇 분이 들어오는지 묻는다.
 * 디자인: docs/design/scanner-attendance-count/fable-handoff.md (시각안 1 "정면 질문").
 *
 * ★ 이 앱에서 **답해야 닫히는 첫 오버레이**다 ★
 *
 * 다른 모든 오버레이는 알려 주고 3초 뒤 스스로 사라진다. 스태프는 이미 "오버레이는 기다리면
 * 없어진다"를 학습했다. 이 화면이 그 습관대로 다뤄지면 그 가족은 입장 처리가 되지 않은 채
 * 넘어간다. 그래서 여기에는 타이머가 없고, 대신 아직 입장 전이라는 사실을 질문 바로 아래에
 * 눈에 띄게 붙인다(시선이 마지막에 닿는 하단이 아니라).
 *
 * 기본 선택값을 두지 않는다. 모/부 중 어느 쪽이 더 흔한지 근거가 없고, 기본값이 있으면
 * 스태프가 확인 없이 눌러 이 화면의 존재 이유를 무력화한다.
 *
 * 이 제품에 좌석 개념은 없다 — 세는 단위는 사람뿐이다.
 */

import { useCallback, useEffect, useId, useRef } from "react";
import { AlertTriangle, Users } from "lucide-react";
import { ATTENDANCE_PARTY_LABELS, type CheckInOutcome } from "@/shared/api";

export interface AttendanceCountOverlayProps {
  outcome: CheckInOutcome;
  /** 확정 요청이 나가는 중 — 두 선택지를 모두 잠근다. */
  confirming: boolean;
  onSelect: (attendedCount: 1 | 2) => void;
  onCancel: () => void;
}

/** 게이트에서 장갑 낀 손과 급한 동작을 전제로 접근성 최소치(44px)의 두 배로 잡는다. */
const MIN_TOUCH_TARGET = 88;

const OPTIONS: ReadonlyArray<{ count: 1 | 2; helper: string }> = [
  { count: 1, helper: "한 분만 입장" },
  { count: 2, helper: "두 분 모두 입장" },
];

export function AttendanceCountOverlay({ outcome, confirming, onSelect, onCancel }: AttendanceCountOverlayProps) {
  const titleId = useId();
  const summaryId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);

  // 열리면 포커스를 대화 상자 안으로 옮긴다. 화면 낭독기가 배경 카메라에 머물면 안 된다.
  useEffect(() => {
    firstOptionRef.current?.focus();
  }, []);

  /** Escape 는 취소와 같다 — 결과(입장 처리 안 됨)는 호출부가 토스트로 말한다. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && !confirming) {
        event.preventDefault();
        onCancel();
        return;
      }
      // 포커스 트랩 — 탭이 배경으로 새면 스태프가 답을 잃는다.
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (focusable === undefined || focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [confirming, onCancel],
  );

  const name = outcome.representativeStudentName?.trim();
  const party = outcome.attendanceParty;
  // 이름이 없으면 지어내지 않는다 — 예약 인원만 말한다.
  const summary = name !== undefined && name !== "" && party !== null
    ? `${name} 학생 학부모(${ATTENDANCE_PARTY_LABELS[party]}) · ${outcome.familySeatCount ?? 2}명 예약`
    : `${outcome.familySeatCount ?? 2}명 예약`;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={summaryId}
      ref={dialogRef}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        // 기존 결과 오버레이보다 짙게 — "다른 종류의 오버레이"임을 배경부터 말한다.
        background: "rgba(4, 8, 16, 0.94)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "24px 20px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 680, width: "100%" }}>
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 30,
            fontWeight: 800,
            letterSpacing: "var(--tracking-display)",
            color: "var(--gray-0)",
          }}
        >
          몇 분 입장하세요?
        </h2>
        <p id={summaryId} style={{ margin: "10px 0 0", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
          {summary}
        </p>

        {/* 미확정 배지는 질문 바로 아래다 — 하단은 시선이 마지막에 닿아 놓치기 쉽다. */}
        <p
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            margin: "16px 0 0",
            padding: "7px 14px",
            borderRadius: "var(--radius-pill)",
            border: "1px solid rgba(249,192,89,0.5)",
            background: "rgba(249,192,89,0.12)",
            color: "var(--status-warning-on-dark)",
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          아직 입장 처리 전이에요
        </p>
      </div>

      <div style={{ display: "grid", gap: 14, width: "100%", maxWidth: 680, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {OPTIONS.map((option, index) => (
          <button
            key={option.count}
            ref={index === 0 ? firstOptionRef : undefined}
            type="button"
            disabled={confirming}
            onClick={() => onSelect(option.count)}
            style={{
              minHeight: Math.max(MIN_TOUCH_TARGET, 168),
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "20px 16px",
              borderRadius: "var(--radius-xl)",
              // 두 선택지는 정확히 같은 비중이다 — 어느 쪽도 권장하지 않는다.
              border: "1px solid rgba(0,171,219,0.45)",
              background: "rgba(0,171,219,0.10)",
              color: "var(--gray-0)",
              fontFamily: "inherit",
              cursor: confirming ? "progress" : "pointer",
              opacity: confirming ? 0.55 : 1,
              transition: "opacity var(--dur-fast) var(--ease-out)",
            }}
          >
            <Users size={22} aria-hidden="true" style={{ color: "var(--mint-400)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>
              {option.count}명
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.68)" }}>{option.helper}</span>
          </button>
        ))}
      </div>

      <div aria-live="polite" style={{ minHeight: 20, fontSize: 13.5, fontWeight: 700, color: "var(--mint-400)" }}>
        {confirming ? "입장 처리 중…" : ""}
      </div>

      <button
        type="button"
        disabled={confirming}
        onClick={onCancel}
        style={{
          minHeight: 44,
          padding: "10px 18px",
          borderRadius: "var(--radius-pill)",
          border: "1px solid rgba(255,255,255,0.16)",
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          fontFamily: "inherit",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: confirming ? "not-allowed" : "pointer",
        }}
      >
        취소하고 다시 스캔
      </button>
    </div>
  );
}
