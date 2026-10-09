"use client";

// 디자인 시스템 상단 탐색. 선택 탭 뒤로 미끄러지는 배경 필 표시

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { brandHomeLabel } from "./brand";

/**
 * 탐색 항목
 */
export interface TopNavItem {
  /**
   * 표시 문구
   */
  label: string;

  /**
   * 값
   */
  value: string;
}

/**
 * 브랜드 링크와 탭 목록이 있는 상단 탐색 막대
 */
export function TopNav({
  brand = "입시설명회",
  items = [],
  value,
  onChange,
  onBrandClick,
  right = null,
  sticky = true,
}: {
  /**
   * 브랜드 문구. 기본 `입시설명회`
   */
  brand?: string;

  /**
   * 탭 항목
   */
  items?: TopNavItem[];

  /**
   * 선택 탭 값
   */
  value?: string;

  /**
   * 탭 선택 처리
   */
  onChange?: (value: string) => void;

  /**
   * 브랜드 클릭 처리. 있으면 홈 버튼 역할과 접근성 이름 부여
   */
  onBrandClick?: () => void;

  /**
   * 오른쪽 영역
   */
  right?: ReactNode;

  /**
   * 상단 고정 여부
   */
  sticky?: boolean;
}) {
  // 탭 요소 참조, 선택 필 위치, 호버 탭
  const refs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [pill, setPill] = useState({ left: 0, width: 0 });
  const [hover, setHover] = useState<string | null>(null);

  // 선택 탭이 바뀌면 필을 그 탭 위치·너비로 이동
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
        <a
          onClick={onBrandClick}
          onKeyDown={(event) => {
            if (onBrandClick && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onBrandClick();
            }
          }}
          role={onBrandClick ? "button" : undefined}
          tabIndex={onBrandClick ? 0 : undefined}
          aria-label={onBrandClick ? brandHomeLabel() : undefined}
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: onBrandClick ? "pointer" : "default", flexShrink: 0 }}
        >
          <BrandMark size={28} radius={9} decorative />
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
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onChange?.(it.value);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-current={active ? "page" : undefined}
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
