"use client";

// 디자인 시스템 일반 대화상자

import { useEffect, type ReactNode } from "react";

/**
 * 일반 대화상자. 배경 클릭·Escape로 닫힘. 포커스 트랩은 없음
 */
export function Dialog({
  open = false,
  onClose,
  title,
  children,
  footer,
  width = 440,
}: {
  /**
   * 열림 여부
   */
  open?: boolean;

  /**
   * 닫기 처리. 있으면 닫기 버튼 표시
   */
  onClose?: () => void;

  /**
   * 제목
   */
  title?: ReactNode;

  /**
   * 본문
   */
  children?: ReactNode;

  /**
   * 하단 버튼 영역
   */
  footer?: ReactNode;

  /**
   * 패널 너비(px)
   */
  width?: number;
}) {
  // 열려 있는 동안 Escape로 닫기
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--surface-scrim)",
        backdropFilter: "blur(8px)",
        animation: "ds-fade-in var(--dur-base) var(--ease-out) both",
        padding: 24,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto",
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "var(--blur-veil)",
          border: "1px solid var(--border-hairline)",
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-float)",
          padding: "var(--card-pad-lg)",
          animation: "ds-pop var(--dur-slow) var(--ease-spring) both",
          fontFamily: "var(--font-body)",
        }}
      >
        {(title || onClose) && (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
            {title && (
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "var(--text-h2)", color: "var(--text-strong)", letterSpacing: "var(--tracking-heading)" }}>
                {title}
              </h3>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "var(--radius-sm)", flexShrink: 0,
                  background: "var(--surface-sunken)", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", transition: "background var(--dur-fast) var(--ease-out)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        )}
        <div style={{ color: "var(--text-body)", fontSize: 15, lineHeight: "var(--leading-body)" }}>{children}</div>
        {footer && <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 28 }}>{footer}</div>}
      </div>
    </div>
  );
}
