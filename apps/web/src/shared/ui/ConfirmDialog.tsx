"use client";

/**
 * 파기적 동작 확인 — 핸드오프 요구: `alertdialog`, 포커스 트랩, 취소 버튼 기본 포커스.
 *
 * DS Dialog(shared/ui/Dialog)는 `role="dialog"` 에 포커스 트랩이 없어서
 * 연결 해제처럼 되돌릴 수 없는 확인에는 쓰지 않는다. DS 는 수정하지 않고
 * 같은 시각 언어(라디우스·표면·그림자·타이포)를 그대로 따르는 컴포넌트를 따로 둔다.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** 무엇이 사라지고 무엇이 남는지 — 사용자가 결정할 수 있게 구체적으로. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 동작은 danger. */
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "취소",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  const trapFocus = useCallback((event: KeyboardEvent) => {
    const panel = panelRef.current;
    if (!panel || event.key !== "Tab") return;

    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.offsetParent !== null || element === document.activeElement,
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 기본 포커스는 취소 — 확인이 파기적이라 Enter 오입력이 곧장 실행되면 안 된다.
    cancelRef.current?.querySelector<HTMLElement>("button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      trapFocus(event);
    };

    document.addEventListener("keydown", onKeyDown);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      restoreFocusRef.current?.focus();
    };
  }, [open, onCancel, trapFocus]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 130,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--surface-scrim)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        style={{
          width: 460,
          maxWidth: "100%",
          maxHeight: "86vh",
          overflowY: "auto",
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "var(--blur-veil)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-float)",
          padding: "var(--card-pad-lg)",
          fontFamily: "var(--font-body)",
        }}
      >
        <h2
          id={titleId}
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: "var(--text-h2)",
            color: "var(--text-strong)",
            letterSpacing: "var(--tracking-heading)",
          }}
        >
          {title}
        </h2>

        <div
          id={bodyId}
          style={{ marginTop: 14, color: "var(--text-body)", fontSize: 14.5, lineHeight: "var(--leading-body)" }}
        >
          {children}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 26 }}>
          <div ref={cancelRef}>
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              {cancelLabel}
            </Button>
          </div>
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
