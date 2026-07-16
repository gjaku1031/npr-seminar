"use client";

import { useState, useTransition } from "react";
import { Icons } from "@/shared/ui";
import { signOutAction } from "../api/actions";

/**
 * 우상단 알림 벨 + 아바타 메뉴 (flows ADMIN-F1-05) — 와이어프레임 App rightSlot 이식.
 * 메뉴: 관리자 표시 + 로그아웃.
 */
export function AvatarMenu() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      <span style={{ position: "relative", color: "var(--text-muted)", display: "inline-flex", cursor: "pointer" }}>
        <Icons.bell size={19} />
        <span style={{ position: "absolute", top: -2, right: -3, width: 8, height: 8, borderRadius: "50%", background: "var(--mint-500)", border: "2px solid var(--gray-1)" }} />
      </span>
      <div style={{ position: "relative" }}>
        <span
          onClick={() => setOpen((o) => !o)}
          style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--mint-100)", color: "var(--mint-700)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: open ? "2px solid var(--violet-800)" : "2px solid transparent", transition: "border var(--dur-fast) var(--ease-out)" }}
        >
          관
        </span>
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90 }} />
            <div style={{ position: "absolute", top: 42, right: 0, width: 208, background: "var(--surface-card)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-float)", border: "1px solid var(--border-hairline)", overflow: "hidden", zIndex: 91, animation: "ds-fade-up var(--dur-fast) var(--ease-out) both" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-hairline)" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-strong)" }}>관리자</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mint-500)" }} />
                  전체 권한
                </div>
              </div>
              <button
                onClick={() => startTransition(() => signOutAction())}
                disabled={pending}
                style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13.5, color: "var(--status-danger)", fontFamily: "var(--font-body)", textAlign: "left", fontWeight: 600 }}
              >
                <Icons.logOut size={15} /> {pending ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
