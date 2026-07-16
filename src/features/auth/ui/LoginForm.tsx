"use client";

import { useTransition } from "react";
import { Button, Icons } from "@/shared/ui";
import { signInAction } from "../api/actions";

/**
 * 단일 관리자 로그인 카드 (명세 §1.1 · flows ADMIN-F1) — 와이어프레임 LoginScreen 이식.
 * 역할 선택 없음. 학부모·학생은 로그인 없이 모바일 예약(/reserve)만 이용한다.
 */
export function LoginForm() {
  const [pending, startTransition] = useTransition();

  return (
    <div style={{ width: "100%", maxWidth: 400, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-float)", padding: "38px 36px 32px", animation: "ds-pop var(--dur-slow) var(--ease-spring) both" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "var(--violet-800)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 13 }}>npr</span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 18, color: "var(--violet-900)", letterSpacing: "-0.02em" }}>입시설명회</span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 22, letterSpacing: "var(--tracking-heading)" }}>운영 콘솔 로그인</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, lineHeight: 1.55 }}>
        관리자 계정으로 전 모듈을 사용합니다.
        <br />
        <span style={{ color: "var(--text-faint)" }}>학부모·학생은 로그인 없이 모바일 예약 페이지를 이용해요.</span>
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "14px 16px", marginTop: 22, borderRadius: "var(--radius-lg)", background: "var(--surface-brand-soft)", border: "1.5px solid var(--violet-800)" }}>
        <span style={{ width: 42, height: 42, borderRadius: "var(--radius-sm)", background: "var(--violet-800)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icons.userCheck size={20} />
        </span>
        <span style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-strong)" }}>관리자</div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>예약 명단 · 문자 · 설명회 · 통계 전체</div>
        </span>
      </div>
      <Button
        size="lg"
        fullWidth
        disabled={pending}
        onClick={() => startTransition(() => signInAction())}
        iconRight={<Icons.arrowRight size={17} />}
        style={{ marginTop: 22 }}
      >
        {pending ? "입장 중…" : "입장하기"}
      </Button>
    </div>
  );
}
