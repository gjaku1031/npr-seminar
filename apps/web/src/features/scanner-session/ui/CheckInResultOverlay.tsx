"use client";

/**
 * 최종 체크인 결과 오버레이 — outcome/error/backlog 를 카메라 위에 **큰 고정 오버레이**로 띄운다.
 *
 * 시각은 기존 `CheckInResultPanel` 의 카피·색·아이콘을 그대로 재사용한다(중복 정의하지 않는다).
 * 여기서 더하는 건 (1) 화면을 덮는 fixed 백드롭, (2) 접근성 dialog 시맨틱,
 * (3) 정확히 3000ms 뒤 자동으로 닫는 타이머다.
 *
 * 접근성:
 * - 성공/중복 결과는 `dialog`, 거부·오류는 `alertdialog` 로 둔다.
 * - `aria-modal` 로 모달임을 알리고, 낭독(aria-live)은 안쪽 패널이 이미 담당하므로 여기서 중복하지 않는다.
 *
 * 타이머:
 * - 새 최종 결과가 오면(panel 참조가 바뀌면) effect 가 재실행돼 이전 타이머를 교체한다.
 * - cleanup 에서 반드시 타이머를 지운다 — 언마운트·결과 교체에서 누수·이중 reset 을 막는다.
 */

import { useEffect } from "react";
import type { CheckInPanel } from "../model/useQrCheckIn";
import { CheckInResultPanel } from "./CheckInResultPanel";

/** 최종 결과 표시 시간(ms) — 이 시간이 지나면 스스로 닫고 카메라로 돌아간다. */
const AUTO_DISMISS_MS = 3000;

type FinalKind = "outcome" | "error" | "backlog";

function isFinal(panel: CheckInPanel): panel is Extract<CheckInPanel, { kind: FinalKind }> {
  return panel.kind === "outcome" || panel.kind === "error" || panel.kind === "backlog";
}

export interface CheckInResultOverlayProps {
  panel: CheckInPanel;
  /** 자동 닫힘(3000ms) 또는 표시 종료 시 호출 — 보통 checkIn.reset. */
  onDismiss: () => void;
}

export function CheckInResultOverlay({ panel, onDismiss }: CheckInResultOverlayProps) {
  const final = isFinal(panel);

  useEffect(() => {
    if (!final) return;
    // 새 최종 결과마다 타이머를 새로 잡는다(panel 이 deps 라 이전 타이머는 cleanup 으로 교체된다).
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [panel, final, onDismiss]);

  if (!final) return null;

  // 성공/중복은 대화 상자, 거부·오류는 경보 대화 상자로 알린다.
  const role = panel.kind === "outcome" ? "dialog" : "alertdialog";

  return (
    <div
      role={role}
      aria-modal="true"
      aria-label="입장 처리 결과"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(10,15,26,0.72)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
      }}
    >
      {/* 카피·색·아이콘은 기존 패널을 그대로 쓰고, 오버레이에서는 크게 보이도록 1.15배 확대한다. */}
      <div style={{ width: 480, transform: "scale(1.15)", transformOrigin: "center" }}>
        <CheckInResultPanel panel={panel} />
      </div>
    </div>
  );
}
