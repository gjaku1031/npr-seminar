"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { defaultErrorMessage, isApiError, loginProjectSession, useOperationKey } from "@/shared/api";
import { BrandMark, Button, Icons, Input } from "@/shared/ui";

/**
 * 단일 관리자 로그인 카드 (명세 §1.1 · flows ADMIN-F1) — 와이어프레임 LoginScreen 이식.
 * 역할 선택 없음. 학부모·학생은 로그인 없이 공개 루트(`/`)의 모바일 예약만 이용한다.
 *
 * 계약 POST /api/v1/auth/login 을 브라우저에서 직접 부른다 — CSRF 토큰이 클라이언트
 * 메모리에만 사는 값이라(shared/api/client.ts) 서버 액션으로는 계약을 만족시킬 수 없다.
 *
 * 자격증명은 제출 순간에만 메모리에 있고, 성공하든 실패하든 로그·스토리지에 남기지 않는다.
 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const operationKey = useOperationKey();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    const id = username.trim();
    if (!id || !password) {
      setError("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      await loginProjectSession({ username: id, password }, { idempotencyKey: operationKey.current() });
      operationKey.settle();
      // 성공 후 자격증명을 메모리에서도 지운다.
      setPassword("");
      // pending 을 풀지 않는다 — 화면 전환까지 버튼이 잠겨 있어야 중복 제출이 없다.
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      operationKey.settle(err);
      setPassword("");
      setError(loginErrorMessage(err));
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{ width: "100%", maxWidth: 400, background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-float)", padding: "38px 36px 32px", animation: "ds-pop var(--dur-slow) var(--ease-spring) both" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BrandMark size={34} radius={10} />
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

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 22 }}>
        <Input
          label="아이디"
          placeholder="관리자 아이디"
          value={username}
          onChange={setUsername}
          icon={<Icons.user size={17} />}
          disabled={pending}
        />
        <Input
          label="비밀번호"
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={setPassword}
          icon={<Icons.lock size={17} />}
          disabled={pending}
          error={error ?? undefined}
        />
      </div>

      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={pending}
        iconRight={<Icons.arrowRight size={17} />}
        style={{ marginTop: 22 }}
      >
        {pending ? "입장 중…" : "입장하기"}
      </Button>
    </form>
  );
}

/**
 * 계정 존재 여부를 드러내지 않는 한국어 문구.
 *
 * 401(자격증명 불일치)과 403(계정은 맞지만 거절)을 **같은 문구**로 묶는다 — 둘을 나누면
 * 그 차이 자체가 "이 아이디는 존재한다"는 신호가 되어, 계약이 401 을 generic 으로 규정한
 * 이유를 화면에서 되돌리게 된다.
 */
function loginErrorMessage(error: unknown): string {
  if (isApiError(error) && (error.status === 401 || error.status === 403 || error.status === 400)) {
    return "아이디 또는 비밀번호가 올바르지 않아요.";
  }
  if (isApiError(error) && error.status === 429) {
    return "로그인 시도가 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  }
  return defaultErrorMessage(error);
}
