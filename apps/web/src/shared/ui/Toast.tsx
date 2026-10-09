"use client";

// 디자인 시스템 알림. 화면 고정 위치는 사용처가 결정

import type { CSSProperties, ReactNode } from "react";

/**
 * 색조별 아이콘
 */
const ICONS: Record<string, ReactNode> = {
  success: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
  ),
  danger: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
  ),
  info: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
  ),
};

/**
 * 짧은 결과 알림
 */
export function Toast({
  open = true,
  tone = "success",
  children,
  action,
  onAction,
  style,
}: {
  /**
   * 표시 여부
   */
  open?: boolean;

  /**
   * 색조
   */
  tone?: "success" | "danger" | "info";

  /**
   * 내용
   */
  children?: ReactNode;

  /**
   * 동작 버튼 문구
   */
  action?: ReactNode;

  /**
   * 동작 버튼 처리
   */
  onAction?: () => void;

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 12,
        padding: "13px 18px",
        borderRadius: "var(--radius-md)",
        background: "rgba(23,33,15,0.92)",
        backdropFilter: "var(--blur-veil)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "#FFFFFF",
        boxShadow: "var(--shadow-float), 0 0 30px rgba(54,95,8,0.20)",
        fontSize: 14.5, fontFamily: "var(--font-body)", fontWeight: 500,
        animation: "ds-fade-up var(--dur-slow) var(--ease-spring) both",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: tone === "success" ? "var(--status-success)" : tone === "danger" ? "var(--status-danger)" : "var(--status-info)",
          color: tone === "success" ? "#FFFFFF" : "#FEF2F2",
        }}
      >
        {ICONS[tone] ?? ICONS.info}
      </span>
      {children}
      {action && (
        <button
          type="button"
          onClick={onAction}
          style={{
            marginLeft: 6, padding: "6px 12px", borderRadius: "var(--radius-xs)",
            background: "rgba(255,255,255,0.12)", border: "none",
            color: "var(--mint-400)", fontSize: 13, fontWeight: 700, fontFamily: "var(--font-body)",
            cursor: "pointer",
          }}
        >
          {action}
        </button>
      )}
    </div>
  );
}
