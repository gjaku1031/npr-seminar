"use client";

/**
 * 6자리 연결 코드 입력. 실제 input 하나 + 시각적 6칸, `autocomplete="one-time-code"`
 *
 * 칸을 6개의 input 으로 쪼개지 않음: 스크린리더·붙여넣기·IME 가 모두 깨짐
 * 실제 input 하나를 투명하게 덮고 칸은 표시 전용으로 그림
 *
 * 코드는 부모의 메모리 state 에만 있음 — 저장하지 않음
 */

import { useId, useRef } from "react";
import { PAIRING_CODE_LENGTH, normalizePairingCode } from "@/shared/api";

/**
 * 연결 코드 입력 속성
 */
export interface PairingCodeInputProps {
  /**
   * 입력값
   */
  value: string;

  /**
   * 변경 처리
   */
  onChange: (value: string) => void;

  /**
   * 제출 처리
   */
  onSubmit: () => void;

  /**
   * 비활성 여부
   */
  disabled?: boolean;
  /**
   * 접근성: 오류가 있으면 aria-invalid 와 설명을 연결함
   */
  error?: string | null;

  /**
   * 입력 아래 안내 문구
   */
  hint?: string;
}

/**
 * 터치 영역 최소 60px. iPad 기준
 */
const CELL_SIZE = 60;

/**
 * 6자리 연결 코드 입력
 */
export function PairingCodeInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  error,
  hint,
}: PairingCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const describedById = useId();

  const cells = Array.from({ length: PAIRING_CODE_LENGTH }, (_, index) => value[index] ?? "");

  return (
    <div>
      <label
        htmlFor={inputId}
        style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text-strong)", marginBottom: 10 }}
      >
        연결 코드 6자리
      </label>

      <div style={{ position: "relative" }}>
        {/* 표시 전용 6칸 — 실제 포커스는 아래 input 이 가짐 */}
        <div aria-hidden="true" style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
          {cells.map((char, index) => {
            const active = !disabled && index === Math.min(value.length, PAIRING_CODE_LENGTH - 1);
            return (
              <span
                key={index}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: CELL_SIZE,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "var(--radius-md)",
                  border: error
                    ? "1.5px solid var(--status-danger)"
                    : char
                      ? "1.5px solid var(--violet-700)"
                      : active
                        ? "1.5px solid var(--violet-500)"
                        : "1px solid var(--border-soft)",
                  background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
                  fontFamily: "var(--font-display)",
                  fontWeight: 800,
                  fontSize: 26,
                  color: "var(--text-strong)",
                }}
              >
                {char}
              </span>
            );
          })}
        </div>

        {/* 실제 입력 — 시각적으로 투명하지만 포커스 링은 칸에 그려짐 */}
        <input
          ref={inputRef}
          id={inputId}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(normalizePairingCode(event.target.value).slice(0, PAIRING_CODE_LENGTH))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onSubmit();
            }
          }}
          // 자동 대문자·붙여넣기·OTP 자동완성 지원
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={PAIRING_CODE_LENGTH}
          aria-invalid={Boolean(error)}
          aria-describedby={describedById}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: CELL_SIZE,
            opacity: 0,
            border: "none",
            background: "transparent",
            // 캐럿이 칸 사이에 보이지 않도록
            color: "transparent",
            fontSize: 26,
            letterSpacing: "1em",
            textAlign: "center",
            cursor: disabled ? "not-allowed" : "text",
          }}
        />
      </div>

      <p
        id={describedById}
        role={error ? "alert" : undefined}
        aria-live={error ? undefined : "polite"}
        style={{
          margin: "10px 0 0",
          fontSize: 13,
          lineHeight: 1.55,
          color: error ? "var(--status-danger)" : "var(--text-muted)",
        }}
      >
        {error ?? hint ?? "관리자 화면에 표시된 6자리를 입력해 주세요."}
      </p>
    </div>
  );
}
