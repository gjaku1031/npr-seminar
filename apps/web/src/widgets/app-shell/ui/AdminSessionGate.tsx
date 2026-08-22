"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SessionNotice, useSessionCheck } from "@/features/auth";
import { ConsoleShell } from "./ConsoleShell";

/** 관리자 콘솔을 ADMIN 확인 전에는 마운트하지 않고, 세션이 사라지면 즉시 가린다. */
export function AdminSessionGate({ children }: { children: ReactNode }) {
  const { state, retry } = useSessionCheck();
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (pathname === previousPath.current) return;
    previousPath.current = pathname;
    const timer = window.setTimeout(() => { void retry(); }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, retry]);

  if (state.kind === "admin" || state.kind === "verifying") {
    return (
      <>
        <div hidden={state.kind === "verifying"}>
          <ConsoleShell displayName={state.displayName}>{children}</ConsoleShell>
        </div>
        {state.kind === "verifying" && <SessionNotice title="로그인 상태 확인 중" message="잠시만 기다려 주세요." />}
      </>
    );
  }
  if (state.kind === "checking") return <SessionNotice title="로그인 상태 확인 중" message="운영 콘솔에 연결하고 있습니다." />;
  if (state.kind === "expired") return <SessionNotice title="세션이 만료되었습니다" message="다시 로그인하면 운영 콘솔을 이용할 수 있습니다." action="로그인하기" onAction={() => window.location.replace("/login/")} />;
  if (state.kind === "anonymous") return <SessionNotice title="로그인이 필요합니다" message="운영 콘솔을 이용하려면 관리자 계정으로 로그인해 주세요." action="로그인하기" onAction={() => window.location.replace("/login/")} />;
  if (state.kind === "scanner") return <SessionNotice title="관리자 권한이 필요합니다" message="현재 스캐너 기기 세션으로는 운영 콘솔을 열 수 없습니다." action="로그인 화면으로" onAction={() => window.location.replace("/login/")} />;
  if (state.kind === "forbidden") return <SessionNotice title="접근 권한이 없습니다" message="이 계정은 운영 콘솔에 접근할 수 없습니다." action="다시 확인" onAction={() => void retry()} />;
  return <SessionNotice title="로그인 상태를 확인할 수 없습니다" message={state.message} action="다시 시도" onAction={() => void retry()} />;
}
