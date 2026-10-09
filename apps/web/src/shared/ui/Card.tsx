"use client";

// 디자인 시스템 카드

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * 변형별 배경·그림자·테두리
 */
const VARIANTS: Record<string, CSSProperties> = {
  elevated: { background: "var(--surface-card)", boxShadow: "var(--shadow-card)", border: "1px solid var(--border-hairline)" },
  outline: { background: "var(--surface-card)", boxShadow: "none", border: "1px solid var(--border-soft)" },
  sunken: { background: "var(--surface-sunken)", boxShadow: "none", border: "1px solid transparent" },
  brand: { background: "var(--surface-brand)", boxShadow: "var(--shadow-raised)", border: "1px solid transparent", color: "var(--text-on-brand)" },
  accent: { background: "var(--surface-accent-soft)", boxShadow: "none", border: "1px solid var(--mint-200)" },
};

/**
 * 카드 컨테이너. interactive면 호버 시 떠오르는 효과
 */
export function Card({
  children,
  variant = "elevated",
  padding = "var(--card-pad)",
  interactive = false,
  onClick,
  radius = "var(--radius-lg)",
  style,
}: {
  /**
   * 내용
   */
  children?: ReactNode;

  /**
   * 변형. 기본 elevated
   */
  variant?: "elevated" | "outline" | "sunken" | "brand" | "accent";

  /**
   * 안쪽 여백
   */
  padding?: string | number;

  /**
   * 호버 효과·포인터 커서 사용 여부
   */
  interactive?: boolean;

  /**
   * 클릭 처리
   */
  onClick?: () => void;

  /**
   * 모서리 반경
   */
  radius?: string | number;

  /**
   * 추가 스타일
   */
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
              boxShadow: "var(--shadow-raised), 0 0 0 1px var(--violet-600), 0 0 32px rgba(54,95,8,0.22)",
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
