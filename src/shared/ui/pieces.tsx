"use client";

/**
 * 콘솔 공용 조각 — QR 플레이스홀더·상태 배지·통계 카드·빈 상태·KV.
 * 핸드오프 ui_kits/npr-admin/shared.jsx 이식 (window 전역 → 모듈).
 * status는 string으로 받는다 — shared는 도메인(entities)을 모른다 (설계 §4.1).
 */

import type { CSSProperties, ReactNode } from "react";
import { Badge } from "./Badge";

export function nprQrCells(code: string, n = 11): boolean[] {
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
  const out: boolean[] = [];
  for (let i = 0; i < n * n; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    out.push((seed >> 16) % 2 === 0);
  }
  return out;
}

/** QR 이미지 플레이스홀더 (실 QR 연동 전 — 명세 §12) */
export function QrBox({ code = "NPR-0000", size = 120, style }: { code?: string; size?: number; style?: CSSProperties }) {
  const n = 11;
  const cells = nprQrCells(code, n);
  return (
    <div
      style={{
        width: size, height: size, background: "#FFFFFF",
        border: "1px solid var(--mint-200)", borderRadius: "var(--radius-xs)",
        padding: size * 0.08,
        display: "grid", gridTemplateColumns: `repeat(${n}, 1fr)`, gap: 1,
        boxSizing: "border-box", flexShrink: 0,
        ...style,
      }}
    >
      {cells.map((on, i) => (
        <span key={i} style={{ background: on ? "var(--violet-950)" : "transparent", borderRadius: 0.5 }} />
      ))}
    </div>
  );
}

/** 예약 상태 배지 — reserved/entered/no_show/cancelled (명세 §11 표기) */
export function ResStatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  if (status === "entered") return <Badge tone="success" dot size={size}>입장 완료</Badge>;
  if (status === "cancelled") return <Badge tone="danger" size={size}>취소됨</Badge>;
  if (status === "no_show") return <Badge tone="warning" size={size}>노쇼</Badge>;
  return <Badge tone="warning" dot size={size}>미체크</Badge>;
}

const STAT_TONES: Record<string, string> = {
  brand: "var(--violet-800)",
  accent: "var(--mint-600)",
  danger: "var(--status-danger)",
  success: "var(--status-success)",
  neutral: "var(--text-muted)",
};

export function StatCard({
  label,
  value,
  suffix,
  tone = "brand",
  icon,
  delay = 0,
  onClick,
  active,
}: {
  label: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  tone?: keyof typeof STAT_TONES;
  icon?: ReactNode;
  delay?: number;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? "var(--surface-brand-soft)" : "var(--surface-card)",
        border: active ? "1.5px solid var(--violet-800)" : "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-lg)", padding: "18px 20px", boxShadow: "var(--shadow-card)",
        cursor: onClick ? "pointer" : "default", transition: "all var(--dur-fast) var(--ease-out)",
        animation: `ds-fade-up var(--dur-slow) var(--ease-out) ${delay}ms both`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-muted)", fontWeight: 600 }}>
        {icon && <span style={{ color: STAT_TONES[tone], display: "inline-flex" }}>{icon}</span>}
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 8 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 30, color: STAT_TONES[tone], fontFeatureSettings: '"tnum"' }}>{value}</span>
        {suffix && <span style={{ fontSize: 12.5, color: "var(--text-faint)" }}>{suffix}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children?: ReactNode }) {
  return (
    <div style={{ padding: "44px 0", textAlign: "center", color: "var(--text-faint)", fontSize: 14, animation: "ds-fade-in var(--dur-base) both" }}>
      {children}
    </div>
  );
}

/** 필드 라벨 + 값 (읽기 전용 행) */
export function KV({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, letterSpacing: "var(--tracking-caps)", color: "var(--text-faint)", fontWeight: 700 }}>{k}</span>
      <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-strong)" }}>{v}</span>
    </div>
  );
}
