"use client";

/**
 * 인원 선택 오버레이 — 게이트에 도착한 예약이 실제로 몇 명 들어오는지 물음
 *
 * 예약 인원과 무관하게 언제나 뜸. 1명 예약이라고 한 분만 오는 것이 아님 — 가족이
 * 더 붙어 오는 일이 실제로 있고, 그때 예약 인원을 그대로 적으면 조용히 틀린 숫자가 쌓임
 *
 * 이 앱에서 답해야 닫히는 첫 오버레이임
 *
 * 다른 모든 오버레이는 알려 주고 3초 뒤 스스로 사라짐. 스태프는 이미 "오버레이는 기다리면
 * 없어진다"를 학습했음. 이 화면이 그 습관대로 다뤄지면 그 가족은 입장 처리가 되지 않은 채
 * 넘어감. 그래서 여기에는 타이머가 없고, 대신 아직 입장 전이라는 사실을 질문 바로 아래에
 * 눈에 띄게 붙임(시선이 마지막에 닿는 하단이 아니라)
 *
 * 기본 선택값을 두지 않음. 모/부 중 어느 쪽이 더 흔한지 근거가 없고, 기본값이 있으면
 * 스태프가 확인 없이 눌러 이 화면의 존재 이유를 무력화함
 *
 * 이 제품에 좌석 개념은 없음 — 세는 단위는 사람뿐임
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Delete, Users } from "lucide-react";
import { ATTENDANCE_PARTY_LABELS, MAX_ATTENDED_COUNT, type CheckInOutcome } from "@/shared/api";

/**
 * 입장 인원 선택 오버레이 속성
 */
export interface AttendanceCountOverlayProps {
  /**
   * 인원 확인이 필요한 체크인 결과
   */
  outcome: CheckInOutcome;
  /**
   * 확정 요청이 나가는 중 — 두 선택지를 모두 잠금
   */
  confirming: boolean;

  /**
   * 고른 인원으로 입장 확정
   */
  onSelect: (attendedCount: number) => void;

  /**
   * 취소 처리
   */
  onCancel: () => void;
}

/**
 * 게이트에서 장갑 낀 손과 급한 동작을 전제로 접근성 최소치(44px)의 두 배로 잡음
 */
const MIN_TOUCH_TARGET = 88;

/**
 * 1·2 는 압도적으로 흔한 답이라 한 번에 누를 수 있게 두고, 그 밖은 기타로 받음
 * 예약 인원과 무관하게 언제나 물어봄 — 1명 예약에 두 분이 오는 일이 실제로 있음
 */
const QUICK_OPTIONS: ReadonlyArray<{ count: number; helper: string }> = [
  { count: 1, helper: "한 분 입장" },
  { count: 2, helper: "두 분 입장" },
];

/**
 * 숫자패드 키 순서
 */
const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

/**
 * 세 선택지는 정확히 같은 비중임 — 어느 쪽도 권장하지 않음
 */
function choiceStyle(confirming: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    padding: "18px 14px",
    borderRadius: "var(--radius-xl)",
    border: "1px solid rgba(0,171,219,0.45)",
    background: "rgba(0,171,219,0.10)",
    color: "var(--gray-0)",
    fontFamily: "inherit",
    cursor: confirming ? "progress" : "pointer",
    opacity: confirming ? 0.55 : 1,
    transition: "opacity var(--dur-fast) var(--ease-out)",
  };
}

/**
 * 숫자패드도 게이트에서 누름 — 최소 터치 타깃을 그대로 지킴
 */
function keyStyle(confirming: boolean): React.CSSProperties {
  return {
    minHeight: MIN_TOUCH_TARGET,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md)",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "var(--gray-0)",
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 800,
    cursor: confirming ? "progress" : "pointer",
  };
}

/**
 * 입장 인원 선택 오버레이. 인원을 고르기 전에는 닫히지 않음
 */
export function AttendanceCountOverlay({ outcome, confirming, onSelect, onCancel }: AttendanceCountOverlayProps) {
  const titleId = useId();
  const summaryId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstOptionRef = useRef<HTMLButtonElement | null>(null);

  // 열리면 포커스를 대화 상자 안으로 옮김. 화면 낭독기가 배경 카메라에 머물면 안 됨
  useEffect(() => {
    firstOptionRef.current?.focus();
  }, []);

  // Escape 는 취소와 같음 — 결과(입장 처리 안 됨)는 호출부가 토스트로 말함
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && !confirming) {
        event.preventDefault();
        onCancel();
        return;
      }
      // 포커스 트랩 — 탭이 배경으로 새면 스태프가 답을 잃음
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

  // 기타 입력 모드. 1·2 는 한 번에 누르고, 그 밖의 수는 숫자패드로 받음
  // 빈 문자열로 시작함 — 기본값을 채워 두면 스태프가 확인 없이 확정 버튼을 누름
  const [keypad, setKeypad] = useState<string | null>(null);
  const typed = keypad === null || keypad === "" ? null : Number.parseInt(keypad, 10);
  const typedValid = typed !== null && Number.isInteger(typed) && typed >= 1 && typed <= MAX_ATTENDED_COUNT;

  const name = outcome.representativeStudentName?.trim();
  const party = outcome.attendanceParty;
  // 이름이 없으면 지어내지 않음 — 예약 인원만 말함
  const summary = name !== undefined && name !== "" && party !== null
    ? `${name} 학생 학부모(${ATTENDANCE_PARTY_LABELS[party]})${outcome.familySeatCount === null ? "" : ` · ${outcome.familySeatCount}명 예약`}`
    : outcome.familySeatCount === null ? "예약 확인됨" : `${outcome.familySeatCount}명 예약`;

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
        // 기존 결과 오버레이보다 짙게 — "다른 종류의 오버레이"임을 배경부터 말함
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

        {/* 미확정 배지는 질문 바로 아래임 — 하단은 시선이 마지막에 닿아 놓치기 쉬움 */}
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

      {keypad === null ? (
        <div style={{ display: "grid", gap: 12, width: "100%", maxWidth: 680, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {QUICK_OPTIONS.map((option, index) => (
            <button
              key={option.count}
              ref={index === 0 ? firstOptionRef : undefined}
              type="button"
              disabled={confirming}
              onClick={() => onSelect(option.count)}
              style={{ ...choiceStyle(confirming), minHeight: Math.max(MIN_TOUCH_TARGET, 152) }}
            >
              <Users size={20} aria-hidden="true" style={{ color: "var(--mint-400)" }} />
              <span style={{ fontFamily: "var(--font-display)", fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>
                {option.count}명
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,0.68)" }}>{option.helper}</span>
            </button>
          ))}
          <button
            type="button"
            disabled={confirming}
            onClick={() => setKeypad("")}
            style={{ ...choiceStyle(confirming), minHeight: Math.max(MIN_TOUCH_TARGET, 152) }}
          >
            <Users size={20} aria-hidden="true" style={{ color: "var(--mint-400)" }} />
            <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 800, lineHeight: 1.1 }}>기타</span>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,0.68)" }}>직접 입력</span>
          </button>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 340 }}>
          {/* 누른 수를 크게 되비춤 — 누른 것과 확정될 것이 같은지 눈으로 확인해야 함 */}
          <div
            aria-live="polite"
            style={{
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontSize: 50,
              fontWeight: 800,
              minHeight: 62,
              color: keypad === "" ? "rgba(255,255,255,0.32)" : "var(--gray-0)",
            }}
          >
            {keypad === "" ? "–" : `${keypad}명`}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {KEYPAD.map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={confirming}
                /* 앞자리 0 과 3자리 입력을 애초에 만들지 않음 — 상한을 넘는 값이 생기지 않게 */
                onClick={() => setKeypad((current) => {
                  const next = `${current ?? ""}${digit}`;
                  return next.startsWith("0") || next.length > 2 ? current : next;
                })}
                style={{ ...keyStyle(confirming), ...(digit === "0" ? { gridColumn: "2" } : {}) }}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              aria-label="지우기"
              disabled={confirming}
              onClick={() => setKeypad((current) => (current ?? "").slice(0, -1))}
              style={keyStyle(confirming)}
            >
              <Delete size={20} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            disabled={confirming || !typedValid}
            onClick={() => { if (typedValid && typed !== null) onSelect(typed); }}
            style={{
              marginTop: 12,
              width: "100%",
              minHeight: 56,
              borderRadius: "var(--radius-lg)",
              border: "1px solid rgba(0,171,219,0.45)",
              background: typedValid ? "rgba(0,171,219,0.18)" : "rgba(255,255,255,0.04)",
              color: typedValid ? "var(--gray-0)" : "rgba(255,255,255,0.35)",
              fontFamily: "inherit",
              fontSize: 16,
              fontWeight: 800,
              cursor: confirming ? "progress" : typedValid ? "pointer" : "not-allowed",
            }}
          >
            {typedValid ? `${typed}명 입장` : `1~${MAX_ATTENDED_COUNT} 사이로 입력해 주세요`}
          </button>

          <button
            type="button"
            disabled={confirming}
            onClick={() => setKeypad(null)}
            style={{
              marginTop: 8,
              width: "100%",
              minHeight: 44,
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
            1명 · 2명 선택으로 돌아가기
          </button>
        </div>
      )}

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
