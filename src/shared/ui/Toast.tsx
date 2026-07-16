"use client";

/** DS Toast — 핸드오프 components/feedback/Toast.jsx 이식. 화면 우하단 고정 배치는 사용처가 결정. */

import type { CSSProperties, ReactNode } from "react";

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

export function Toast({
  open = true,
  tone = "success",
  children,
  action,
  onAction,
  style,
}: {
  open?: boolean;
  tone?: "success" | "danger" | "info";
  children?: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
  style?: CSSProperties;
}) {
  if (!open) return null;

  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 12,
        padding: "13px 18px",
        borderRadius: "var(--radius-md)",
        background: "rgba(16,24,40,0.92)",
        backdropFilter: "var(--blur-veil)",
        border: "1px solid rgba(255,255,255,0.10)",
        color: "#F8FAFC",
        boxShadow: "var(--shadow-float), 0 0 30px rgba(37,99,235,0.20)",
        fontSize: 14.5, fontFamily: "var(--font-body)", fontWeight: 500,
        animation: "ds-fade-up var(--dur-slow) var(--ease-spring) both",
        ...style,
      }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
          background: tone === "success" ? "var(--mint-500)" : tone === "danger" ? "var(--status-danger)" : "var(--violet-700)",
          color: tone === "success" ? "var(--text-on-accent)" : "#FEF2F2",
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
            background: "rgba(248,250,252,0.12)", border: "none",
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
