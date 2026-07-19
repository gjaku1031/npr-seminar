"use client";

/** DS Select — 핸드오프 components/forms/Select.jsx 이식. 커스텀 드롭다운. */

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  computeSelectMenuPosition,
  SELECT_MENU_MARGIN,
  type SelectMenuPosition,
} from "./select-menu-position";

export interface SelectOption {
  value: string;
  label: string;
}

/* 포털 메뉴 높이 추정 — 상하 뒤집기 판단과 최대 높이 계산용(정확할 필요는 없다). */
const SELECT_MENU_ITEM_H = 40;
const SELECT_MENU_PAD_Y = 12;

export function Select({
  label,
  options = [],
  value,
  onChange,
  placeholder = "선택",
  required = false,
  disabled = false,
  portal = false,
  style,
}: {
  label?: string;
  options?: Array<SelectOption | string>;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  /** 필수 입력 — 트리거에 aria-required 를 실어 접근성 트리에 노출한다(런타임 검증은 호출부 몫). */
  required?: boolean;
  disabled?: boolean;
  /**
   * 포털/충돌 모드 — 열린 메뉴를 body 로 포털해 `position: fixed` 로 띄우고, 트리거 rect 로
   * 좌표·상하 뒤집기·가장자리 clamp 를 계산한다(computeSelectMenuPosition). 조상이 overflow 로
   * 자르는 곳(예: 학생 현황 필터 카드)에서 메뉴가 잘리지 않게 하는 opt-in 이다. 기본값 false 라
   * 다른 화면의 기존 Select 렌더링은 그대로 둔다. 켜면 키보드·listbox 시맨틱도 함께 활성화된다.
   */
  portal?: boolean;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(-1);
  // 포털 모드 키보드 활성 항목(active descendant). 마우스 hover 도 여기로 모은다.
  const [activeIdx, setActiveIdx] = useState(-1);
  const [position, setPosition] = useState<SelectMenuPosition | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const valueOf = (o: SelectOption | string) => (typeof o === "string" ? o : o.value);
  const labelOf = (o: SelectOption | string | undefined) =>
    o == null ? "" : typeof o === "string" ? o : o.label;
  const selectedIndex = options.findIndex((o) => valueOf(o) === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // 포털 좌표는 트리거 rect 로 낸다. 여는 순간(핸들러)에 한 번, 열려 있는 동안 스크롤·
  // 리사이즈마다 다시 계산해 fixed 메뉴가 트리거를 따라가게 한다 — effect 는 구독만 맡는다.
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const contentHeight = options.length * SELECT_MENU_ITEM_H + SELECT_MENU_PAD_Y;
    setPosition(
      computeSelectMenuPosition(
        { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width },
        { width: window.innerWidth, height: window.innerHeight },
        contentHeight,
      ),
    );
  }, [options.length]);

  const openMenu = useCallback(
    (idx: number) => {
      if (disabled) return;
      setActiveIdx(idx);
      if (portal) measure();
      setOpen(true);
    },
    [disabled, portal, measure],
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setActiveIdx(-1);
  }, []);

  const commit = useCallback(
    (idx: number) => {
      const o = options[idx];
      if (o !== undefined) onChange?.(valueOf(o));
      closeMenu();
      triggerRef.current?.focus();
    },
    [options, onChange, closeMenu],
  );

  // 바깥 클릭 닫기 — 트리거/루트와 (포털된) 메뉴 둘 다 안쪽으로 친다.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, closeMenu]);

  // 포털 모드: 열려 있는 동안만 스크롤·리사이즈를 구독한다(조상 스크롤까지 capture 로 잡는다).
  useEffect(() => {
    if (!open || !portal) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, portal, measure]);

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!portal || disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        openMenu(selectedIndex >= 0 ? selectedIndex : 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(options.length - 1);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIdx((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIdx(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIdx(options.length - 1);
        break;
      case "Enter":
      case " ":
      case "Spacebar":
        e.preventDefault();
        if (activeIdx >= 0) commit(activeIdx);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
        triggerRef.current?.focus();
        break;
      case "Tab":
        // 트랩하지 않는다 — 기본 Tab 이동은 그대로 두고 메뉴만 닫는다.
        closeMenu();
        break;
      default:
        break;
    }
  };

  const activeDescendant = portal && open && activeIdx >= 0 ? optionId(activeIdx) : undefined;

  const renderOptions = (highlightIdx: number, mode: "default" | "portal") =>
    options.map((o, i) => {
      const val = valueOf(o);
      const isSel = val === value;
      const isActive = highlightIdx === i;
      return (
        <div
          key={val}
          id={mode === "portal" ? optionId(i) : undefined}
          role={mode === "portal" ? "option" : undefined}
          aria-selected={mode === "portal" ? isSel : undefined}
          onClick={() => (mode === "portal" ? commit(i) : (onChange?.(val), setOpen(false)))}
          onMouseEnter={() => (mode === "portal" ? setActiveIdx(i) : setHoverIdx(i))}
          onMouseLeave={() => (mode === "portal" ? undefined : setHoverIdx(-1))}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 12px", borderRadius: "var(--radius-xs)",
            fontSize: 14.5, cursor: "pointer",
            background: isSel ? "var(--violet-50)" : isActive ? "var(--surface-sunken)" : "transparent",
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
    });

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 7, position: "relative", fontFamily: "var(--font-body)", ...style }}>
      {label && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>{label}</span>}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu(selectedIndex >= 0 ? selectedIndex : 0))}
        onKeyDown={onButtonKeyDown}
        role={portal ? "combobox" : undefined}
        aria-haspopup={portal ? "listbox" : undefined}
        aria-expanded={portal ? open : undefined}
        aria-controls={portal && open ? listboxId : undefined}
        aria-activedescendant={activeDescendant}
        aria-required={required || undefined}
        aria-label={label && !selected && placeholder === "" ? label : undefined}
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

      {/* 기본(비포털) 모드 — 절대배치 메뉴. 다른 화면의 기존 동작을 그대로 보존한다. */}
      {open && !portal && (
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
          {renderOptions(hoverIdx, "default")}
        </div>
      )}

      {/* 포털 모드 — body 로 포털한 fixed 메뉴. 조상 overflow 에 잘리지 않는다. */}
      {open && portal && position !== null &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-activedescendant={activeDescendant}
            style={{
              position: "fixed",
              left: position.left,
              top: position.top,
              width: position.width,
              maxWidth: `calc(100vw - ${SELECT_MENU_MARGIN * 2}px)`,
              maxHeight: position.maxHeight,
              overflowY: "auto",
              boxSizing: "border-box",
              zIndex: 100,
              background: "var(--surface-card)", borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-hairline)", boxShadow: "var(--shadow-float)",
              padding: 6,
              fontFamily: "var(--font-body)",
              animation: "ds-scale-in var(--dur-base) var(--ease-spring) both",
              transformOrigin: position.placement === "above" ? "bottom center" : "top center",
            }}
          >
            {renderOptions(activeIdx, "portal")}
          </div>,
          document.body,
        )}
    </div>
  );
}
