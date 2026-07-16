import { signOutAction } from "../api/actions";

/** 아바타 메뉴 → 로그아웃 (flows OWNER-F1). 서버 컴포넌트 — form action으로 직접 호출. */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="text-sm text-muted transition-colors hover:text-accent">
        로그아웃
      </button>
    </form>
  );
}
