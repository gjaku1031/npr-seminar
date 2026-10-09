"use client";

// 디자인 시스템 태그. 필터 칩·선택 토글

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * 선택 가능한 칩
 */
export function Tag({
  children,
  selected = false,
  onClick,
  onRemove,
  count,
  style,
}: {
  /**
   * 내용
   */
  children?: ReactNode;

  /**
   * 선택 여부
   */
  selected?: boolean;

  /**
   * 클릭 처리. 있으면 호버 효과
   */
  onClick?: () => void;

  /**
   * 제거 처리. 있으면 X 표시
   */
  onRemove?: () => void;

  /**
   * 뒤쪽 개수 표시. null·undefined면 생략
   */
  count?: number | string | null;

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  const [hover, setHover] = useState(false);
  const interactive = !!onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 34,
        padding: "0 14px",
        borderRadius: "var(--radius-pill)",
        border: selected ? "1px solid transparent" : "1px solid var(--border-soft)",
        background: selected
          ? "linear-gradient(135deg, var(--violet-800), var(--violet-600))"
          : hover && interactive
            ? "var(--surface-brand-soft)"
            : "var(--surface-card)",
        color: selected ? "var(--text-on-brand)" : "var(--text-body)",
        boxShadow: selected ? "0 4px 18px rgba(54,95,8,0.30)" : "none",
        fontSize: 13.5,
        fontWeight: selected ? 600 : 500,
        fontFamily: "var(--font-body)",
        cursor: interactive || onRemove ? "pointer" : "default",
        transform: selected ? "scale(1.02)" : "scale(1)",
        transition: "all var(--dur-fast) var(--ease-spring)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
      {count != null && <span style={{ fontSize: 11.5, opacity: 0.65, fontWeight: 600 }}>{count}</span>}
      {onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ display: "inline-flex", marginRight: -4, opacity: 0.6, lineHeight: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </span>
      )}
    </button>
  );
}
