"use client";

/** DS TopNav — 핸드오프 components/navigation/TopNav.jsx 이식. 슬라이딩 필 탭바. */

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface TopNavItem {
  label: string;
  value: string;
}

export function TopNav({
  brand = "입시설명회",
  brandBadge = "npr",
  items = [],
  value,
  onChange,
  onBrandClick,
  right = null,
  sticky = true,
}: {
  brand?: string;
  brandBadge?: string;
  items?: TopNavItem[];
  value?: string;
  onChange?: (value: string) => void;
  onBrandClick?: () => void;
  right?: ReactNode;
  sticky?: boolean;
}) {
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = value ? refs.current[value] : null;
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, items.length]);

  return (
    <header
      style={{
        position: sticky ? "sticky" : "relative", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.85)", backdropFilter: "var(--blur-veil)",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "0 var(--container-pad)", height: 60, display: "flex", alignItems: "center", gap: 24 }}>
        <a onClick={onBrandClick} style={{ display: "flex", alignItems: "center", gap: 8, cursor: onBrandClick ? "pointer" : "default", flexShrink: 0 }}>
          <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--violet-800)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 11 }}>{brandBadge}</span>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--violet-900)", letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{brand}</span>
        </a>
        <nav style={{ position: "relative", display: "flex", gap: 2, flex: 1, minWidth: 0, overflowX: "auto" }}>
          <span
            style={{
              position: "absolute", top: "50%", height: 36, transform: "translateY(-50%)",
              left: pill.left, width: pill.width,
              background: "var(--violet-100)", borderRadius: "var(--radius-pill)",
              transition: "left var(--dur-base) var(--ease-spring), width var(--dur-base) var(--ease-spring)",
            }}
          />
          {items.map((it) => {
            const active = it.value === value;
            return (
              <a
                key={it.value}
                ref={(el) => { refs.current[it.value] = el; }}
                onClick={() => onChange?.(it.value)}
                onMouseEnter={() => setHover(it.value)}
                onMouseLeave={() => setHover(null)}
                style={{
                  position: "relative", zIndex: 1,
                  padding: "8px 15px", borderRadius: "var(--radius-pill)", cursor: "pointer",
                  fontSize: 14, fontFamily: "var(--font-body)",
                  fontWeight: active ? 700 : 500,
                  color: active ? "var(--violet-900)" : hover === it.value ? "var(--text-strong)" : "var(--text-muted)",
                  whiteSpace: "nowrap",
                  transition: "color var(--dur-fast) var(--ease-out)",
                }}
              >
                {it.label}
              </a>
            );
          })}
        </nav>
        {right}
      </div>
    </header>
  );
}
