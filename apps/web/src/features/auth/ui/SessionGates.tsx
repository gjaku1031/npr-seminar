"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ADMIN_SESSION_EXPIRED_EVENT, defaultErrorMessage, getCurrentActor, isAborted, isApiError } from "@/shared/api";
import { LoginForm } from "./LoginForm";

type SessionState =
  | { kind: "checking" }
  | { kind: "admin"; displayName: string }
  | { kind: "verifying"; displayName: string }
  | { kind: "anonymous" }
  | { kind: "expired" }
  | { kind: "scanner" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

/** 브라우저 세션 확인 훅. 갱신·탭 복귀·BFCache 복원 시 재확인하고 이전 요청은 취소한다. */
export function useSessionCheck() {
  const [state, setState] = useState<SessionState>({ kind: "checking" });
  const abortRef = useRef<AbortController | null>(null);
  const hadAdminRef = useRef(false);

  const check = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState((previous) => previous.kind === "admin" || previous.kind === "verifying"
      ? { kind: "verifying", displayName: previous.displayName }
      : { kind: "checking" });
    try {
      const actor = await getCurrentActor(controller.signal);
      if (controller.signal.aborted) return;
      if (actor.role === "SCANNER") {
        setState({ kind: "scanner" });
      } else {
        hadAdminRef.current = true;
        setState({ kind: "admin", displayName: actor.displayName.trim() || "관리자" });
      }
    } catch (error) {
      if (controller.signal.aborted || isAborted(error)) return;
      if (isApiError(error) && error.status === 401) {
        setState({ kind: hadAdminRef.current ? "expired" : "anonymous" });
      } else if (isApiError(error) && error.status === 403) {
        setState({ kind: "forbidden" });
      } else {
        setState({ kind: "error", message: defaultErrorMessage(error) });
      }
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => { void check(); }, 0);
    const onFocus = () => { if (document.visibilityState === "visible") void check(); };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void check(); };
    const onExpired = () => {
      abortRef.current?.abort();
      setState({ kind: "expired" });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.clearTimeout(initialCheck);
      abortRef.current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
    };
  }, [check]);

  return { state, retry: check };
}

/** 정적 인증 상태를 기존 화면 토큰에 맞춘 간결한 안내로 표시한다. */
export function SessionNotice({ title, message, action, onAction }: {
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 400, width: "100%", background: "var(--surface-card)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-float)", padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>{title}</h1>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.6 }}>{message}</p>
        {action && onAction && <button type="button" onClick={onAction} style={{ padding: "10px 18px", borderRadius: "var(--radius-md)", background: "var(--violet-800)", color: "white", border: 0, cursor: "pointer" }}>{action}</button>}
      </div>
    </main>
  );
}

/** 로그인 화면에서 기존 ADMIN만 콘솔로 이동시키고 SCANNER는 관리자 로그인을 안내한다. */
export function LoginSessionGate() {
  const { state, retry } = useSessionCheck();
  const showForm = state.kind === "anonymous" || state.kind === "expired" || state.kind === "scanner";

  useEffect(() => {
    if (state.kind === "admin") window.location.replace("/sessions/");
  }, [state]);

  return (
    <>
      {/* 재확인 중에도 폼을 유지해 입력한 관리자 자격증명을 지우지 않는다. */}
      <div hidden={!showForm}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          {state.kind === "scanner" && <p role="status" style={{ maxWidth: 400, color: "var(--status-danger)" }}>스캐너 기기 세션입니다. 운영 콘솔에는 관리자 계정으로 로그인해 주세요.</p>}
          <LoginForm />
        </div>
      </div>
      {(state.kind === "checking" || state.kind === "admin" || state.kind === "verifying") && <SessionNotice title="로그인 상태 확인 중" message="잠시만 기다려 주세요." />}
      {(state.kind === "error" || state.kind === "forbidden") && <SessionNotice title="로그인 상태를 확인할 수 없습니다" message={state.kind === "error" ? state.message : "인증 서버에서 요청을 거절했습니다."} action="다시 시도" onAction={() => void retry()} />}
    </>
  );
}
