"use client";

// 디자인 시스템 버튼

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * 크기별 높이·여백·글자 크기·간격·모서리
 */
const SIZES = {
  sm: { height: 36, padding: "0 16px", fontSize: 13, gap: 6, radius: "var(--radius-sm)" },
  md: { height: 44, padding: "0 22px", fontSize: 15, gap: 8, radius: "var(--radius-md)" },
  lg: { height: 54, padding: "0 30px", fontSize: 16, gap: 10, radius: "var(--radius-md)" },
} as const;

/**
 * 변형별 기본·호버 스타일
 */
const VARIANTS: Record<string, { base: CSSProperties; hover: CSSProperties }> = {
  primary: {
    base: { background: "linear-gradient(135deg, var(--violet-800), var(--violet-600))", color: "var(--text-on-brand)", border: "1px solid transparent" },
    hover: { background: "linear-gradient(135deg, var(--violet-700), var(--violet-500))" },
  },
  accent: {
    base: { background: "linear-gradient(135deg, var(--mint-700), var(--mint-600))", color: "var(--text-on-brand)", border: "1px solid transparent" },
    hover: { background: "linear-gradient(135deg, var(--mint-600), var(--mint-700))" },
  },
  secondary: {
    base: { background: "var(--surface-card)", color: "var(--text-brand)", border: "1px solid var(--border-soft)" },
    hover: { background: "var(--surface-brand-soft)", border: "1px solid var(--violet-600)" },
  },
  ghost: {
    base: { background: "transparent", color: "var(--text-brand)", border: "1px solid transparent" },
    hover: { background: "var(--violet-50)" },
  },
  danger: {
    base: { background: "var(--status-danger)", color: "#FFFFFF", border: "1px solid transparent" },
    hover: { background: "var(--status-danger-hover)" },
  },
};

/**
 * 버튼 속성
 */
export interface ButtonProps {
  /**
   * 내용
   */
  children?: ReactNode;

  /**
   * 변형. 기본 primary
   */
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";

  /**
   * 크기. 기본 md
   */
  size?: "sm" | "md" | "lg";

  /**
   * 비활성 여부
   */
  disabled?: boolean;

  /**
   * 너비 100% 여부
   */
  fullWidth?: boolean;

  /**
   * 앞쪽 아이콘
   */
  icon?: ReactNode;

  /**
   * 뒤쪽 아이콘
   */
  iconRight?: ReactNode;

  /**
   * 클릭 처리
   */
  onClick?: () => void;

  /**
   * 버튼 type. 기본 button
   */
  type?: "button" | "submit";

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}

/**
 * 호버·누름 효과가 있는 버튼
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  fullWidth = false,
  icon = null,
  iconRight = null,
  onClick,
  type = "button",
  style,
}: ButtonProps) {
  // 마우스 호버·누름 상태. 비활성이면 효과 없음
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);
  const s = SIZES[size] ?? SIZES.md;
  const v = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: s.gap,
        height: s.height,
        padding: s.padding,
        fontSize: s.fontSize,
        fontFamily: "var(--font-body)",
        fontWeight: 600,
        letterSpacing: "var(--tracking-body)",
        borderRadius: s.radius,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transform: press && !disabled ? "scale(0.955)" : hover && !disabled ? "translateY(-1.5px)" : "none",
        boxShadow: hover && !disabled
          ? variant === "accent" ? "0 8px 26px rgba(0,138,170,0.35)"
          : variant === "danger" ? "0 8px 26px rgba(180,35,24,0.35)"
          : variant === "primary" ? "0 8px 28px rgba(54,95,8,0.40)"
          : "var(--shadow-card)"
          : "none",
        transition: "all var(--dur-fast) var(--ease-out)",
        whiteSpace: "nowrap",
        ...v.base,
        ...(hover && !disabled ? v.hover : {}),
        ...style,
      }}
    >
      {icon}
      {children}
      {iconRight}
    </button>
  );
}
