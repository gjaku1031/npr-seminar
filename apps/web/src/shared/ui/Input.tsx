"use client";

// 디자인 시스템 입력 필드

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * 라벨·아이콘·힌트·오류 문구가 있는 입력 필드
 */
export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = "text",
  hint,
  error,
  icon = null,
  disabled = false,
  size = "md",
  style,
}: {
  /**
   * 라벨
   */
  label?: ReactNode;

  /**
   * 자리 표시 문구
   */
  placeholder?: string;

  /**
   * 값
   */
  value?: string;

  /**
   * 값 변경 처리
   */
  onChange?: (value: string) => void;

  /**
   * input type. 기본 text
   */
  type?: string;

  /**
   * 도움말. 오류가 없을 때 표시
   */
  hint?: ReactNode;

  /**
   * 오류 문구. 테두리·라벨이 오류 색으로 바뀜
   */
  error?: ReactNode;

  /**
   * 앞쪽 아이콘
   */
  icon?: ReactNode;

  /**
   * 비활성 여부
   */
  disabled?: boolean;

  /**
   * 크기. md 46px, lg 54px 높이
   */
  size?: "md" | "lg";

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  const [focus, setFocus] = useState(false);
  const h = size === "lg" ? 54 : 46;

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 7, fontFamily: "var(--font-body)", ...style }}>
      {label && (
        <span style={{ fontSize: 13, fontWeight: 600, color: error ? "var(--status-danger)" : "var(--text-strong)" }}>
          {label}
        </span>
      )}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: h,
          padding: "0 16px",
          borderRadius: "var(--radius-md)",
          background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
          border: error
            ? "1.5px solid var(--status-danger)"
            : focus
              ? "1.5px solid var(--violet-800)"
              : "1px solid var(--border-soft)",
          boxShadow: focus && !error ? "var(--focus-ring)" : "none",
          transition: "border var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
      >
        {icon && (
          <span style={{ display: "inline-flex", color: focus ? "var(--violet-800)" : "var(--text-faint)", transition: "color var(--dur-fast) var(--ease-out)" }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            flex: 1,
            minWidth: 0,
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: size === "lg" ? 16 : 15,
            fontFamily: "var(--font-body)",
            color: "var(--text-strong)",
            letterSpacing: "var(--tracking-body)",
          }}
        />
      </span>
      {(error || hint) && (
        <span style={{ fontSize: 12.5, color: error ? "var(--status-danger)" : "var(--text-muted)" }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
