"use client";

// 파괴적 작업 확인 대화상자. alertdialog 역할, 포커스 트랩, 취소 버튼 기본 포커스
// 일반 Dialog는 role="dialog"에 포커스 트랩이 없어 연결 해제처럼 되돌릴 수 없는 확인에는 쓰지 않음
// 일반 Dialog는 그대로 두고 같은 시각 언어(모서리·표면·그림자·글꼴)를 따르는 별도 컴포넌트로 둠

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./Button";

/**
 * 포커스 가능한 요소 선택자
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 확인 대화상자 속성
 */
export interface ConfirmDialogProps {
  /**
   * 열림 여부
   */
  open: boolean;

  /**
   * 제목
   */
  title: string;

  /**
   * 무엇이 사라지고 무엇이 남는지 사용자가 판단할 수 있는 구체적 설명
   */
  children: ReactNode;

  /**
   * 확인 버튼 문구
   */
  confirmLabel: string;

  /**
   * 취소 버튼 문구. 기본 `취소`
   */
  cancelLabel?: string;

  /**
   * 확인 버튼 색조. 되돌릴 수 없는 작업은 danger
   */
  tone?: "danger" | "primary";

  /**
   * 처리 중 여부. 두 버튼 비활성과 `처리 중...` 표시
   */
  busy?: boolean;

  /**
   * 확인 버튼 잠금
   *
   * 되돌릴 수 없는 작업에서 문구 정확 입력 같은 추가 조건을 호출부가 걸 때 사용. 잠긴 이유는 children에서 안내
   */
  confirmDisabled?: boolean;

  /**
   * 확인 처리
   */
  onConfirm: () => void;

  /**
   * 취소 처리. Escape 키도 같음
   */
  onCancel: () => void;
}

/**
 * 파괴적 작업 확인 대화상자
 *
 * 열리면 이전 포커스를 기억하고 취소 버튼에 포커스, 본문 스크롤 잠금. 닫히면 둘 다 복원
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "취소",
  tone = "danger",
  busy = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // 패널·취소 버튼·복원할 포커스 참조와 접근성 ID
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  // Tab 순환을 패널 안으로 제한
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
    // 기본 포커스는 취소. 확인이 파괴적이라 Enter 오입력이 바로 실행되면 안 됨
    cancelRef.current?.querySelector<HTMLElement>("button")?.focus();

    // Escape는 취소, Tab은 포커스 트랩
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
          <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} disabled={busy || confirmDisabled}>
            {busy ? "처리 중..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
