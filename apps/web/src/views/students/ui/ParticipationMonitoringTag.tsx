"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { ParticipationMonitoring } from "@/shared/api";
import { Tag } from "@/shared/ui";

/**
 * 팝오버 너비(px)
 */
const POPOVER_WIDTH = 244;

/**
 * 화면 가장자리 여백(px)
 */
const VIEWPORT_GUTTER = 12;

/**
 * 숫자 표시. 없으면 —
 */
function count(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toLocaleString("ko-KR")}명`;
}

/**
 * 선택된 캠퍼스 필터를 참석 규모 요약 트리거로 확장함
 *
 * 마우스 hover·키보드 focus 에서는 잠깐 확인할 수 있고, 클릭·터치는 팝오버를 고정함
 * 필터 행은 자체 가로 스크롤 영역이어서 팝오버를 body portal 로 띄워 잘리지 않게 함
 */
export function ParticipationMonitoringTag({
  label,
  selected,
  monitoring,
  onSelect,
  style,
}: {
  /**
   * 표시 문구
   */
  label: string;

  /**
   * 선택 여부
   */
  selected: boolean;

  /**
   * 명단 모니터링 수치. 없으면 —
   */
  monitoring: ParticipationMonitoring | undefined;

  /**
   * 선택 처리
   */
  onSelect: () => void;

  /**
   * 추가 스타일
   */
  style?: CSSProperties;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const popoverId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const open = selected && (hovered || focused || pinned);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = (kind: "hover" | "focus") => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      if (kind === "hover") setHovered(false);
      else setFocused(false);
    }, 100);
  };

  useEffect(() => () => cancelClose(), []);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxLeft = Math.max(VIEWPORT_GUTTER, window.innerWidth - POPOVER_WIDTH - VIEWPORT_GUTTER);
      setPosition({
        top: rect.bottom + 8,
        left: Math.min(Math.max(VIEWPORT_GUTTER, rect.left), maxLeft),
      });
    };

    const onPointerDown = (event: PointerEvent) => {
      const node = event.target as Node;
      if (triggerRef.current?.contains(node) || popoverRef.current?.contains(node)) return;
      setPinned(false);
      setHovered(false);
      setFocused(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPinned(false);
      setHovered(false);
      setFocused(false);
      triggerRef.current?.focus();
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!selected) {
    return (
      <Tag selected={false} onClick={onSelect} style={style}>
        {label}
      </Tag>
    );
  }

  const rows: ReadonlyArray<[string, number | undefined]> = [
    ["해당 학생", monitoring?.studentCount],
    ["형제원생 제외", monitoring?.familyBookingCount],
    ["참가자수", monitoring?.attendeeCount],
  ];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => {
          onSelect();
          setPinned((value) => !value);
        }}
        onMouseEnter={() => {
          cancelClose();
          setHovered(true);
        }}
        onMouseLeave={() => scheduleClose("hover")}
        onFocus={() => {
          cancelClose();
          setFocused(true);
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next !== null && popoverRef.current?.contains(next)) return;
          scheduleClose("focus");
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 30,
          padding: "0 11px",
          borderRadius: "var(--radius-pill)",
          border: "1px solid transparent",
          background: "linear-gradient(135deg, var(--violet-800), var(--violet-600))",
          color: "var(--text-on-brand)",
          boxShadow: "0 4px 18px rgba(54,95,8,0.30)",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          transform: "scale(1.02)",
          transition: "all var(--dur-fast) var(--ease-spring)",
          whiteSpace: "nowrap",
          ...style,
        }}
      >
        <span>{label}</span>
        <span aria-hidden style={{ width: 1, height: 13, background: "rgba(255,255,255,0.42)" }} />
        <span style={{ fontFeatureSettings: '"tnum"', fontWeight: 700 }}>
          참가자수 {count(monitoring?.attendeeCount)}
        </span>
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            id={popoverId}
            role="note"
            aria-label={`${label} 참가자 집계`}
            tabIndex={-1}
            onMouseEnter={() => {
              cancelClose();
              setHovered(true);
            }}
            onMouseLeave={() => scheduleClose("hover")}
            onFocus={() => {
              cancelClose();
              setFocused(true);
            }}
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (next !== null && triggerRef.current?.contains(next)) return;
              scheduleClose("focus");
            }}
            style={{
              position: "fixed",
              top: position.top,
              left: position.left,
              zIndex: 140,
              width: POPOVER_WIDTH,
              boxSizing: "border-box",
              padding: "9px 12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-hairline)",
              background: "var(--surface-card)",
              boxShadow: "var(--shadow-float)",
              animation: "ds-scale-in var(--dur-base) var(--ease-spring) both",
              transformOrigin: "top left",
            }}
          >
            <div style={{ padding: "2px 2px 7px", fontSize: 11, fontWeight: 700, color: "var(--text-faint)" }}>
              {label} 필터 집계
            </div>
            {rows.map(([rowLabel, value], index) => (
              <div
                key={rowLabel}
                style={{
                  display: "flex",
                  alignItems: "center",
                  minHeight: 36,
                  gap: 12,
                  borderTop: index === 0 ? "1px solid var(--border-hairline)" : "1px solid var(--border-hairline)",
                }}
              >
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-muted)" }}>{rowLabel}</span>
                <strong style={{ fontSize: 13.5, color: "var(--text-strong)", fontFeatureSettings: '"tnum"' }}>
                  {count(value)}
                </strong>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
