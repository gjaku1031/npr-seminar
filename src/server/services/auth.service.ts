import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessModule, type ModuleKey, type User } from "@/entities/user";
import { userRepository } from "../repositories";
import { ForbiddenError } from "./errors";

/**
 * ★ 인증 이음새 (설계 §8) ★ — 명세 v4.0 §1.1 · flows ADMIN-F1.
 *
 * v4.0: 단일 관리자 — 역할 선택이 사라졌다. 와이어프레임의 localStorage(`npr-user`)를
 * **쿠키**로 옮긴 최소 구현(서버가 읽어야 라우트를 가드할 수 있다).
 *
 * ⚠️ 이것은 인증이 아니다 — 쿠키를 위조하면 입장할 수 있다. 실제 로그인(비밀번호·세션·httpOnly)
 * 도입 시 이 파일 내부만 교체하면 되고, 호출부(페이지·액션)는 그대로다.
 */

export const ROLE_COOKIE = "npr-user";

/** 로그인한 사용자 — 미로그인이면 null (로그인 화면으로 보낸다) */
export async function currentUser(): Promise<User | null> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  if (value !== "admin") return null;
  return userRepository.getAdmin();
}

/**
 * 페이지용 가드 — 단일 관리자라 사실상 로그인 확인이다.
 * canAccessModule 판정 지점은 유지한다(역할이 다시 늘어나면 여기만 확장, 설계 §6.5).
 */
export async function requireModuleAccess(module: ModuleKey): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user.role, module)) redirect("/");
  return user;
}

/** Server Action용 확인 — 리다이렉트 대신 도메인 에러 (폼 상태로 반환해야 하므로, 설계 §7) */
export async function assertModuleAccess(module: ModuleKey): Promise<User> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError("로그인이 필요합니다.");
  if (!canAccessModule(user.role, module)) {
    throw new ForbiddenError("이 모듈에 접근할 권한이 없습니다.");
  }
  return user;
}

/** 단일 관리자 로그인 (명세 §1.1) — 실제 인증 도입 시 자격 검증이 여기 들어온다 */
export async function signIn(): Promise<void> {
  (await cookies()).set(ROLE_COOKIE, "admin", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(ROLE_COOKIE);
}
