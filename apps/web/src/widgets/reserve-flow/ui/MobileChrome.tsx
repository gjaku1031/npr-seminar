"use client";

/**
 * 모바일 앱 크롬 — 기존 ReserveFlow 시각 언어를 그대로 유지함
 *
 * 뷰포트 제약(데스크톱 버그 수정): 고정 하단 바·토스트·모달 오버레이가 `position: fixed`
 * 라 맥 데스크톱에서 화면 전체로 늘어났음. 앱 폭(480)에 맞춰 가운데로 묶음
 * iPhone 처럼 좁은 화면에서는 min(100%, 480px) 이 100% 라 가장자리까지 그대로 감
 */

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandMark } from "@/shared/ui";

/**
 * 앱 뷰포트 폭 — ReserveView 의 max-width 480 과 같은 값
 */
const APP_MAX_WIDTH = 480;

/**
 * 포커스 가능한 요소 선택자
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 고정 요소를 앱 폭 안에 가둠 (데스크톱에서 화면 전체로 퍼지지 않게)
 */
const appViewportStyle: CSSProperties = {
  width: `min(100%, ${APP_MAX_WIDTH}px)`,
  left: "50%",
  transform: "translateX(-50%)",
};

/**
 * 모바일 흐름 상단 헤더. 뒤로가기와 제목
 */
export function FlowHeader({ back, title }: { back?: () => void; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", position: "sticky", top: 0, background: "rgba(247,249,242,0.9)", backdropFilter: "var(--blur-veil)", zIndex: 5 }}>
      {back ? (
        <button
          type="button"
          onClick={back}
          aria-label="뒤로"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-strong)", display: "inline-flex", padding: 8, margin: -4 }}
        >
          <ArrowLeft size={19} aria-hidden="true" />
        </button>
      ) : (
        <BrandMark size={26} radius={8} />
      )}
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16.5, color: "var(--violet-900)" }}>
        {title}
      </span>
    </div>
  );
}

/**
 * 하단 고정 액션 바 — 홈 인디케이터(safe-area)를 피해 여백을 줌
 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        ...appViewportStyle,
        padding: "12px 18px calc(20px + env(safe-area-inset-bottom))",
        background: "rgba(247,249,242,0.92)",
        backdropFilter: "var(--blur-veil)",
        borderTop: "1px solid var(--border-hairline)",
        zIndex: 6,
        boxSizing: "border-box",
      }}
    >
      {children}
    </div>
  );
}

/**
 * 토스트 — 상태 변화를 낭독함
 */
export function FlowToast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "calc(24px + env(safe-area-inset-bottom))",
        ...appViewportStyle,
        display: "flex",
        justifyContent: "center",
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      <span style={{ background: "var(--violet-900)", color: "#fff", padding: "11px 18px", borderRadius: "var(--radius-pill)", fontSize: 13, fontWeight: 600, boxShadow: "var(--shadow-raised)", textAlign: "center", animation: "ds-pop var(--dur-base) var(--ease-spring) both" }}>
        {message}
      </span>
    </div>
  );
}

/**
 * 인라인 오류 — 비동기 실패는 즉시 낭독되어야 함
 */
export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "var(--status-danger-soft)", color: "var(--status-danger)", fontSize: 13, lineHeight: 1.5 }}
    >
      {message}
    </div>
  );
}

/**
 * 모달·시트 오버레이 — 앱 폭 안에서만 덮음
 */
export function FlowOverlay({
  onDismiss,
  align = "center",
  ariaLabel,
  dialogRole = "dialog",
  children,
}: {
  /**
   * 닫기 처리
   */
  onDismiss: () => void;

  /**
   * 가운데 또는 아래 정렬
   */
  align?: "center" | "bottom";

  /**
   * 접근성 이름
   */
  ariaLabel: string;

  /**
   * 대화상자 역할
   */
  dialogRole?: "dialog" | "alertdialog";

  /**
   * 내용
   */
  children: ReactNode;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const overlay = overlayRef.current;
    const restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () =>
      overlay
        ? Array.from(overlay.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
            (element) => element.offsetParent !== null || element === document.activeElement,
          )
        : [];

    queueMicrotask(() => {
      const first = focusable()[0];
      (first ?? overlay)?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const candidates = focusable();
      if (candidates.length === 0) {
        event.preventDefault();
        overlay?.focus();
        return;
      }
      const first = candidates[0]!;
      const last = candidates[candidates.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === overlay)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocus?.isConnected) restoreFocus.focus();
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      role={dialogRole}
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        ...appViewportStyle,
        background: "rgba(23,33,15,0.4)",
        backdropFilter: "var(--blur-veil)",
        zIndex: 40,
        display: "flex",
        alignItems: align === "bottom" ? "flex-end" : "center",
        justifyContent: "center",
        padding: align === "bottom" ? 0 : 24,
        boxSizing: "border-box",
        animation: "ds-fade-in var(--dur-fast) both",
      }}
    >
      {children}
    </div>
  );
}
