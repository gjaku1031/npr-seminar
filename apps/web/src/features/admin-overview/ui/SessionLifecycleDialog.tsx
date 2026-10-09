"use client";

/**
 * 회차 종료·삭제 확인 — 문구를 직접 입력해야 확인 버튼이 열림
 *
 * 왜 한 번 더 막는가: 두 조작 모두 학부모가 보는 화면을 즉시 바꿈. 종료하면 그 회차로
 * 새 예약을 받지 못하고, 삭제하면 목록에서 사라짐. 설명회 당일 운영 중에 눌리는 자리라
 * "정말요?" 한 번으로는 부족함 — 손이 미끄러져도 문구까지 타이핑되지는 않음
 *
 * 입력 문구는 조작마다 다름. 종료 화면에서 '삭제합니다'를 치게 하면 방금 무엇을 하는지
 * 헷갈리게 만듦
 *
 * ConfirmDialog 가 role="alertdialog" · 포커스 트랩 · 기본 포커스=취소 · Esc 취소를 줌
 */

import { useId, useState } from "react";
import { ConfirmDialog } from "@/shared/ui";

/**
 * 회차 종료(CLOSE) 또는 보관(ARCHIVE)
 */
export type SessionLifecycleAction = "CLOSE" | "ARCHIVE";

/**
 * 회차 종료·보관 확인 창 속성
 */
export interface SessionLifecycleDialogProps {
  /**
   * 확인할 조작. 닫혀 있으면 null
   */
  action: SessionLifecycleAction | null;

  /**
   * 대상 회차 표시 이름
   */
  sessionLabel: string;

  /**
   * 처리 중 여부
   */
  busy: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 확인 처리
   */
  onConfirm: () => void;

  /**
   * 취소 처리
   */
  onCancel: () => void;
}

/**
 * 조작별 확인 창 문구
 */
const COPY: Readonly<Record<SessionLifecycleAction, {
  /**
   * 제목
   */
  title: string;

  /**
   * 실행 전에 직접 입력해야 하는 문구
   */
  phrase: string;

  /**
   * 확인 버튼 문구
   */
  confirmLabel: string;

  /**
   * 경고 문구
   */
  warning: string;

  /**
   * 부가 설명
   */
  detail: string;
}>> = {
  CLOSE: {
    title: "이 설명회를 종료할까요?",
    phrase: "종료합니다",
    confirmLabel: "설명회 종료",
    warning: "종료하면 이 회차로 새 예약을 받지 않습니다.",
    detail: "이미 받은 예약과 입장 기록은 그대로 남고, 명단·통계도 계속 볼 수 있어요.",
  },
  ARCHIVE: {
    title: "이 설명회를 삭제할까요?",
    phrase: "삭제합니다",
    confirmLabel: "삭제",
    warning: "삭제하면 이 회차가 목록에서 사라집니다.",
    detail: "예약·입장·문자 기록은 지워지지 않고 보관됩니다. 다만 화면에서는 더 이상 고를 수 없어요.",
  },
};

/**
 * 회차 종료·보관 확인 창. 확인 문구를 입력해야 실행됨
 */
export function SessionLifecycleDialog({
  action, sessionLabel, busy, error, onConfirm, onCancel,
}: SessionLifecycleDialogProps) {
  const inputId = useId();
  // 입력값에 어느 조작의 것인지를 함께 들고 있음
  // 창이 닫히거나 다른 조작으로 바뀌면 앞서 친 문구는 곧바로 남의 것이 됨. effect 로
  // 비우는 대신 조작을 대조해 파생하면, 종료 창에 친 '종료합니다'가 삭제 창으로 넘어가
  // 확인 절차를 건너뛰게 만드는 창이 아예 없음
  const [entry, setEntry] = useState<{ action: SessionLifecycleAction; text: string } | null>(null);

  if (action === null) return null;
  const copy = COPY[action];
  const typed = entry !== null && entry.action === action ? entry.text : "";
  const matched = typed.trim() === copy.phrase;

  return (
    <ConfirmDialog
      open
      title={copy.title}
      confirmLabel={copy.confirmLabel}
      tone="danger"
      busy={busy}
      confirmDisabled={!matched}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: "var(--text-strong)" }}>{sessionLabel}</p>
      <p style={{ margin: "10px 0 0", fontSize: 13, fontWeight: 700, color: "var(--status-danger)" }}>
        {copy.warning}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
        {copy.detail}
      </p>

      <label
        htmlFor={inputId}
        style={{ display: "block", margin: "18px 0 6px", fontSize: 12.5, color: "var(--text-body)" }}
      >
        계속하려면 <b style={{ color: "var(--text-strong)" }}>{copy.phrase}</b> 를 입력해 주세요.
      </label>
      <input
        id={inputId}
        value={typed}
        onChange={(event) => setEntry({ action, text: event.target.value })}
        disabled={busy}
        autoComplete="off"
        placeholder={copy.phrase}
        aria-describedby={error === null ? undefined : `${inputId}-error`}
        style={{
          width: "100%",
          minHeight: 44,
          padding: "0 12px",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${matched ? "var(--status-danger)" : "var(--border-hairline)"}`,
          background: "var(--surface-sunken)",
          color: "var(--text-strong)",
          fontFamily: "inherit",
          fontSize: 14,
          boxSizing: "border-box",
        }}
      />

      {error !== null && (
        <p id={`${inputId}-error`} role="alert" style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--status-danger)" }}>
          {error}
        </p>
      )}
    </ConfirmDialog>
  );
}
