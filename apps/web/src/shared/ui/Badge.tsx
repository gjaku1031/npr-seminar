// 디자인 시스템 배지. 상태 없음, 서버·클라이언트 공용

import type { CSSProperties, ReactNode } from "react";

/**
 * 색조별 배경·글자색
 */
const TONES: Record<string, { bg: string; fg: string }> = {
  brand: { bg: "var(--violet-100)", fg: "var(--violet-900)" },
  accent: { bg: "var(--mint-100)", fg: "var(--mint-700)" },
  success: { bg: "var(--status-success-soft)", fg: "var(--status-success)" },
  warning: { bg: "var(--status-warning-soft)", fg: "var(--status-warning)" },
  danger: { bg: "var(--status-danger-soft)", fg: "var(--status-danger)" },
  info: { bg: "var(--status-info-soft)", fg: "var(--status-info)" },
  neutral: { bg: "var(--surface-sunken)", fg: "var(--text-muted)" },
  solid: { bg: "linear-gradient(135deg, var(--violet-700), var(--mint-600))", fg: "var(--text-on-brand)" },
};

/**
 * 배지 색조
 */
export type BadgeTone = keyof typeof TONES;

/**
 * 짧은 상태·분류 표시 배지
 */
export function Badge({
  children,
  tone = "brand",
  dot = false,
  size = "md",
  style,
}: {
  /**
   * 내용
   */
  children?: ReactNode;

  /**
   * 색조. 기본 brand
   */
  tone?: BadgeTone;

  /**
   * 앞쪽 점 표시 여부
   */
  dot?: boolean;

  /**
   * 크기. sm 20px, md 26px 높이
   */
  size?: "sm" | "md";

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  const t = TONES[tone] ?? TONES.brand;
  const sm = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: sm ? 20 : 26,
        padding: sm ? "0 8px" : "0 11px",
        borderRadius: "var(--radius-pill)",
        background: t.bg,
        color: t.fg,
        fontSize: sm ? 11 : 12.5,
        fontWeight: 600,
        fontFamily: "var(--font-body)",
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />}
      {children}
    </span>
  );
}
