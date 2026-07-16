"use client";

/** DS Button — 핸드오프 components/core/Button.jsx 이식 (네임스페이스 → 모듈). */

import { useState, type CSSProperties, type ReactNode } from "react";

const SIZES = {
  sm: { height: 36, padding: "0 16px", fontSize: 13, gap: 6, radius: "var(--radius-sm)" },
  md: { height: 44, padding: "0 22px", fontSize: 15, gap: 8, radius: "var(--radius-md)" },
  lg: { height: 54, padding: "0 30px", fontSize: 16, gap: 10, radius: "var(--radius-md)" },
} as const;

const VARIANTS: Record<string, { base: CSSProperties; hover: CSSProperties }> = {
  primary: {
    base: { background: "linear-gradient(135deg, var(--violet-800), var(--violet-600))", color: "var(--text-on-brand)", border: "1px solid transparent" },
    hover: { background: "linear-gradient(135deg, var(--violet-700), var(--violet-500))" },
  },
  accent: {
    base: { background: "linear-gradient(135deg, var(--mint-600), #4CC9F0)", color: "var(--text-on-accent)", border: "1px solid transparent" },
    hover: { background: "linear-gradient(135deg, var(--mint-500), #6AD8FF)" },
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
    base: { background: "var(--status-danger)", color: "#2E0810", border: "1px solid transparent" },
    hover: { background: "#FF7A93" },
  },
};

export interface ButtonProps {
  children?: ReactNode;
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  style?: CSSProperties;
}

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
          ? variant === "accent" ? "0 8px 26px rgba(14,165,233,0.35)"
          : variant === "danger" ? "0 8px 26px rgba(220,38,38,0.35)"
          : variant === "primary" ? "0 8px 28px rgba(37,99,235,0.45)"
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
