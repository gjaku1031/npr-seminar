"use client";

// 디자인 시스템 스위치. 실제 checkbox를 숨기고 트랙·손잡이를 그림

import type { CSSProperties, ReactNode } from "react";

/**
 * 켜고 끄는 스위치
 */
export function Switch({
  checked = false,
  onChange,
  label,
  disabled = false,
  style,
}: {
  /**
   * 켜짐 여부
   */
  checked?: boolean;

  /**
   * 변경 처리
   */
  onChange?: (checked: boolean) => void;

  /**
   * 라벨
   */
  label?: ReactNode;

  /**
   * 비활성 여부
   */
  disabled?: boolean;

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, fontFamily: "var(--font-body)", ...style }}>
      <input
        className="ds-switch-input"
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: "relative", width: 46, height: 27, borderRadius: "var(--radius-pill)", flexShrink: 0,
          background: checked ? "var(--violet-900)" : "var(--ink-200)",
          transition: "background var(--dur-base) var(--ease-out)",
        }}
      >
        <span
          style={{
            position: "absolute", top: 3, left: 3,
            width: 21, height: 21, borderRadius: "50%",
            background: "#FFFFFF",
            boxShadow: "0 1px 3px rgba(23,33,15,0.25)",
            transform: checked ? "translateX(19px)" : "translateX(0)",
            transition: "transform var(--dur-base) var(--ease-spring)",
          }}
        />
      </span>
      {label && <span style={{ fontSize: 14.5, color: "var(--text-body)" }}>{label}</span>}
    </label>
  );
}
