"use client";

import { useState } from "react";
import { defaultErrorMessage, logoutProjectSession, useOperationKey } from "@/shared/api";
import { Icons } from "@/shared/ui";

/**
 * 우상단 아바타 메뉴 (flows ADMIN-F1-05) — 와이어프레임 App rightSlot 이식.
 * 메뉴: 관리자 표시 + 로그아웃.
 *
 * 표시 이름은 브라우저가 /auth/me 로 확인한 actor 의 displayName 이다 (props). 화면이 스스로
 * 신원을 지어내지 않는다 — 표시되는 사람과 인증된 세션이 갈라지면 안 된다.
 */
export function AvatarMenu({ displayName }: { displayName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const operationKey = useOperationKey();

  const label = displayName.trim() || "관리자";
  const initial = [...label][0] ?? "관";

  async function signOut() {
    if (pending) return;
    setPending(true);
    setError(null);

    try {
      await logoutProjectSession({ idempotencyKey: operationKey.current() });
      operationKey.settle();
      // pending 유지 — 화면 전환까지 잠가 둔다.
      window.location.replace("/login/");
    } catch (err) {
      // 확정 4xx 면 키를 버리고, 네트워크·5xx(결과 미상)면 유지해 같은 키로 재시도한다.
      operationKey.settle(err);
      setError(defaultErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={label}
          aria-label={`${label} 계정 메뉴`}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{ width: 32, height: 32, padding: 0, borderRadius: "50%", background: "var(--mint-100)", color: "var(--mint-700)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-body)", fontSize: 12.5, fontWeight: 800, cursor: "pointer", border: open ? "2px solid var(--violet-800)" : "2px solid transparent", transition: "border var(--dur-fast) var(--ease-out)" }}
        >
          {initial}
        </button>
        {open && (
          <>
            <button
              type="button"
              aria-label="계정 메뉴 닫기"
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 90, border: 0, padding: 0, background: "transparent" }}
            />
            <div role="menu" style={{ position: "absolute", top: 42, right: 0, width: 208, background: "var(--surface-card)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-float)", border: "1px solid var(--border-hairline)", overflow: "hidden", zIndex: 91, animation: "ds-fade-up var(--dur-fast) var(--ease-out) both" }}>
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-hairline)" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--mint-500)" }} />
                  전체 권한
                </div>
              </div>
              {error && (
                <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--status-danger)", borderBottom: "1px solid var(--border-hairline)", lineHeight: 1.5 }}>
                  {error}
                </div>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={signOut}
                disabled={pending}
                style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "11px 16px", background: "none", border: "none", cursor: pending ? "not-allowed" : "pointer", fontSize: 13.5, color: "var(--status-danger)", fontFamily: "var(--font-body)", textAlign: "left", fontWeight: 600, opacity: pending ? 0.6 : 1 }}
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
