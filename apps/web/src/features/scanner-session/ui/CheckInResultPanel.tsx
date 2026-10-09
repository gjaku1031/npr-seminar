"use client";

/**
 * 스캔 결과 패널. 결과 분류는 계약 `CheckInResult` 를 그대로 따름
 *
 * 입장 완료 / 이미 입장 / 다른 설명회 / 취소·폐기 QR / 유효하지 않은 QR /
 * 네트워크 실패를 색·아이콘·문구로 함께 구분함 (색만으로 전달하지 않음)
 * 화면에는 API·세션 구현 용어를 노출하지 않음
 */

import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Ticket, WifiOff, XCircle } from "lucide-react";
import type { CheckInResult, CheckInOutcome } from "@/shared/api";
import { fmtDateTime } from "@/shared/lib/format";
import type { CheckInPanel } from "../model/useQrCheckIn";
import { checkInTone, formatCheckInOutcome, type CheckInTone } from "../lib/check-in-copy";

/**
 * 결과 색조
 */
type Tone = "success" | "warning" | "danger" | "neutral";

/**
 * 색조별 테두리·배경·글자색
 */
const TONE_STYLES: Record<Tone, { border: string; background: string; color: string }> = {
  success: { border: "rgba(84,214,177,0.55)", background: "rgba(84,214,177,0.10)", color: "var(--status-success-on-dark)" },
  warning: { border: "rgba(249,192,89,0.55)", background: "rgba(249,192,89,0.10)", color: "var(--status-warning-on-dark)" },
  danger: { border: "rgba(252,165,165,0.50)", background: "rgba(252,165,165,0.10)", color: "var(--status-danger-on-dark)" },
  neutral: { border: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.62)" },
};

/**
 * 결과 종류별 아이콘 — 색·문구와 함께 결과를 전달함(색만으로 전달하지 않음)
 */
function resultIcon(result: CheckInResult): React.ReactNode {
  switch (result) {
    case "CHECKED_IN":
      return <CheckCircle2 size={22} />;
    case "ALREADY_CHECKED_IN":
      return <AlertTriangle size={22} />;
    case "SESSION_MISMATCH":
    case "EXPIRED_QR":
      return <Clock size={22} />;
    case "CANCELLED":
    case "REVOKED_QR":
      return <CircleSlash size={22} />;
    default:
      return <XCircle size={22} />;
  }
}

/**
 * 색조 테두리 상자
 */
function Frame({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const style = TONE_STYLES[tone];
  return (
    <div
      style={{
        borderRadius: "var(--radius-lg)",
        border: `1px solid ${style.border}`,
        background: style.background,
        padding: "16px 18px",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

/**
 * 체크인 결과 패널
 */
export function CheckInResultPanel({ panel }: { panel: CheckInPanel }) {
  if (panel.kind === "processing") {
    return (
      <Frame tone="neutral">
        <div
          aria-live="polite"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--mint-400)", fontSize: 13.5, fontWeight: 700 }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "2px solid rgba(0,171,219,0.3)",
              borderTopColor: "var(--mint-400)",
              animation: "npr-scan-panel-spin 0.9s linear infinite",
            }}
          />
          확인 중...
          <style>{`@keyframes npr-scan-panel-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </Frame>
    );
  }

  if (panel.kind === "error") {
    return (
      <Frame tone="danger">
        <div role="alert">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--status-danger-on-dark)", fontSize: 13, fontWeight: 800 }}>
            <WifiOff size={20} aria-hidden="true" />
            처리하지 못했어요
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.62)", lineHeight: 1.6 }}>
            {panel.message}
          </p>
        </div>
      </Frame>
    );
  }

  // 미확정 건이 가득 찬 상태 — 새 QR 은 보내지 않음. 무엇을 해야 하는지 명시함
  if (panel.kind === "backlog") {
    return (
      <Frame tone="warning">
        <div role="alert">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "var(--status-warning-on-dark)", fontSize: 13, fontWeight: 800 }}>
            <AlertTriangle size={20} aria-hidden="true" />
            새 QR을 스캔할 수 없어요
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.62)", lineHeight: 1.6 }}>
            결과가 확인되지 않은 입장 처리가 많이 쌓였어요. 네트워크 연결을 확인한 뒤, 방금 스캔한 QR을
            다시 스캔해 결과를 확정해 주세요. 처리된 건이 정리되면 새 QR을 다시 스캔할 수 있어요.
          </p>
        </div>
      </Frame>
    );
  }

  if (panel.kind === "outcome") {
    return <OutcomeView outcome={panel.outcome} />;
  }

  return (
    <Frame tone="neutral">
      <Ticket size={24} aria-hidden="true" style={{ opacity: 0.4, margin: "0 auto" }} />
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.6 }}>
        QR을 스캔하면 결과가 여기에 표시됩니다
      </p>
    </Frame>
  );
}

/**
 * 체크인 결과 본문
 */
function OutcomeView({ outcome }: { outcome: CheckInOutcome }) {
  // 대표학생·참석 학부모·인원은 순수 포맷터가 한 문장으로 만듦(QR·수동 결과 공용)
  const copy = formatCheckInOutcome(outcome);
  const toneKey: CheckInTone = checkInTone(outcome.result);
  const tone = TONE_STYLES[toneKey];

  return (
    <Frame tone={toneKey}>
      {/* 결과가 바뀔 때마다 낭독함 */}
      <div aria-live="assertive">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: tone.color, fontSize: 13, fontWeight: 800 }}>
          <span aria-hidden="true" style={{ display: "inline-flex" }}>
            {resultIcon(outcome.result)}
          </span>
          {copy.title}
        </div>

        {/* 성공·중복은 `{대표학생명} 학생 학부모(모/부) N명 입장 완료` 를 한 줄로 확인함 */}
        <p style={{ margin: "8px 0 0", fontSize: 13.5, fontWeight: 700, color: "var(--gray-1)", lineHeight: 1.6 }}>
          {copy.detail}
        </p>

        <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "rgba(255,255,255,0.4)" }}>
          {fmtDateTime(new Date(outcome.occurredAt))}
        </p>
      </div>
    </Frame>
  );
}
