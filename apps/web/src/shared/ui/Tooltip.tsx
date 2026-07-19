"use client";

/** DS Tooltip — 핸드오프 components/feedback/Tooltip.jsx 이식. */

import { useId, useState, type CSSProperties, type ReactNode } from "react";

export function Tooltip({
  children,
  content,
  side = "top",
  style,
  /** 트리거를 키보드 포커스 대상으로 만들지 — 포인터 전용 요소면 false 로 둔다. */
  focusable = true,
  /**
   * 키보드 포커스 링을 트리거에 보일지. 트리거 자체가 포커스를 받는(포인터 없이도 열리는)
   * 툴팁은 true 로 둬 outline 을 죽이지 않고 뚜렷한 :focus-visible 링을 그린다.
   * 기존 소비자 기본값은 false 라 동작이 그대로다.
   */
  focusRing = false,
  /** 접근성 라벨 — 트리거에 붙는 aria-label (아이콘만 있는 트리거에 필요). */
  label,
  contentStyle,
}: {
  children?: ReactNode;
  content?: ReactNode;
  side?: "top" | "bottom" | "right";
  style?: CSSProperties;
  focusable?: boolean;
  focusRing?: boolean;
  label?: string;
  contentStyle?: CSSProperties;
}) {
  const [show, setShow] = useState(false);
  const tooltipId = useId();

  const pos: CSSProperties =
    {
      top: { bottom: "calc(100% + 8px)", left: "50%", transform: show ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(4px)" },
      bottom: { top: "calc(100% + 8px)", left: "50%", transform: show ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-4px)" },
      right: { left: "calc(100% + 8px)", top: "50%", transform: show ? "translateY(-50%) translateX(0)" : "translateY(-50%) translateX(-4px)" },
    }[side] ?? {};

  return (
    <span
      // 포인터 hover 와 키보드 focus 를 같은 상태로 다룬다 — title 만으로는 키보드에 뜨지 않는다.
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setShow(false);
      }}
      tabIndex={focusable ? 0 : undefined}
      aria-label={label}
      aria-describedby={tooltipId}
      // focusRing 소비자는 outline 을 죽이지 않는다 — 뚜렷한 링은 globals.css 의 :focus-visible 규칙이 그린다.
      className={focusRing ? "ds-tooltip-focusable" : undefined}
      style={{ position: "relative", display: "inline-flex", ...(focusRing ? null : { outline: "none" }), ...style }}
    >
      {children}
      <span
        role="tooltip"
        id={tooltipId}
        style={{
          position: "absolute",
          ...pos,
          padding: "7px 12px",
          borderRadius: "var(--radius-sm)",
          background: "rgba(23,33,15,0.94)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "#FFFFFF",
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: "var(--font-body)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          opacity: show ? 1 : 0,
          transition: "opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)",
          zIndex: 60,
          ...contentStyle,
        }}
      >
        {content}
      </span>
    </span>
  );
}
