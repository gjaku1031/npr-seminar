"use client";

/** DS Card — 핸드오프 components/core/Card.jsx 이식. */

import { useState, type CSSProperties, type ReactNode } from "react";

const VARIANTS: Record<string, CSSProperties> = {
  elevated: { background: "var(--surface-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-hairline)" },
  outline: { background: "var(--surface-card)", boxShadow: "none", border: "1px solid var(--border-soft)" },
  sunken: { background: "var(--surface-sunken)", boxShadow: "none", border: "1px solid transparent" },
  brand: { background: "var(--surface-brand)", boxShadow: "var(--shadow-raised)", border: "1px solid transparent", color: "var(--text-on-brand)" },
  accent: { background: "var(--surface-accent-soft)", boxShadow: "none", border: "1px solid var(--mint-200)" },
};

export function Card({
  children,
  variant = "elevated",
  padding = "var(--card-pad)",
  interactive = false,
  onClick,
  radius = "var(--radius-lg)",
  style,
}: {
  children?: ReactNode;
  variant?: "elevated" | "outline" | "sunken" | "brand" | "accent";
  padding?: string | number;
  interactive?: boolean;
  onClick?: () => void;
  radius?: string | number;
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const v = VARIANTS[variant] ?? VARIANTS.elevated;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: radius,
        padding,
        cursor: interactive ? "pointer" : undefined,
        transition: "transform var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out)",
        ...v,
        ...(interactive && hover
          ? {
              boxShadow: "var(--shadow-raised), 0 0 0 1px var(--violet-600), 0 0 32px rgba(37,99,235,0.22)",
              transform: "translateY(-5px) scale(1.01)",
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
