"use client";

/** DS Select — 핸드오프 components/forms/Select.jsx 이식. 커스텀 드롭다운. */

import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "선택",
  disabled = false,
  style,
}: {
  label?: string;
  options?: Array<SelectOption | string>;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const valueOf = (o: SelectOption | string) => (typeof o === "string" ? o : o.value);
  const labelOf = (o: SelectOption | string | undefined) =>
    o == null ? "" : typeof o === "string" ? o : o.label;
  const selected = options.find((o) => valueOf(o) === value);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 7, position: "relative", fontFamily: "var(--font-body)", ...style }}>
      {label && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{label}</span>}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
          height: 46, padding: "0 14px 0 16px",
          borderRadius: "var(--radius-md)",
          background: disabled ? "var(--surface-sunken)" : "var(--surface-card)",
          border: open ? "1.5px solid var(--violet-800)" : "1px solid var(--border-soft)",
          boxShadow: open ? "var(--focus-ring)" : "none",
          fontSize: 15, fontFamily: "var(--font-body)",
          color: selected ? "var(--text-strong)" : "var(--text-faint)",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "border var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
      >
        {labelOf(selected) || placeholder}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform var(--dur-base) var(--ease-spring)", color: "var(--text-muted)", flexShrink: 0 }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
            background: "var(--surface-card)", borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-float)",
            padding: 6, maxHeight: 280, overflowY: "auto",
            animation: "ds-scale-in var(--dur-base) var(--ease-spring) both",
            transformOrigin: "top center",
          }}
        >
          {options.map((o, i) => {
            const val = valueOf(o);
            const isSel = val === value;
            return (
              <div
                key={val}
                onClick={() => { onChange?.(val); setOpen(false); }}
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(-1)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: "var(--radius-xs)",
                  fontSize: 14.5, cursor: "pointer",
                  background: isSel ? "var(--violet-50)" : hoverIdx === i ? "var(--surface-sunken)" : "transparent",
                  color: isSel ? "var(--violet-900)" : "var(--text-body)",
                  fontWeight: isSel ? 600 : 400,
                  transition: "background var(--dur-fast) var(--ease-out)",
                }}
              >
                {labelOf(o)}
                {isSel && (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
