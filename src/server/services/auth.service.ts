import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessModule, type ModuleKey, type User, type UserRole } from "@/entities/user";
import { userRepository } from "../repositories";
import { ForbiddenError } from "./errors";

/**
 * ★ 인증 이음새 (설계 §8) ★ — 명세 12.1 · flows OWNER-F1 · GANGSA-F1/G1.
 *
 * 현재: 와이어프레임의 localStorage(`npr-user`) 역할 선택을 **쿠키**로 옮긴 최소 구현.
 * 서버가 역할을 읽어야 라우트를 가드할 수 있기 때문이다(브라우저 저장소는 서버가 못 읽는다).
 *
 * ⚠️ 이것은 인증이 아니다 — 쿠키를 위조하면 역할을 바꿀 수 있다. 실제 로그인(비밀번호·세션·httpOnly)
 * 도입 시 이 파일 내부만 교체하면 되고, 호출부(페이지·액션)는 그대로다.
 */

export const ROLE_COOKIE = "npr-user";

const ROLES: UserRole[] = ["owner", "siljang", "gangsa"];

function isRole(value: string | undefined): value is UserRole {
  return value !== undefined && ROLES.includes(value as UserRole);
}

/** 로그인한 사용자 — 미로그인이면 null (로그인 화면으로 보낸다) */
export async function currentUser(): Promise<User | null> {
  const role = (await cookies()).get(ROLE_COOKIE)?.value;
  if (!isRole(role)) return null;

  // 역할에 해당하는 사용자 정보(이름·teacherId)를 서버에서 읽는다 — 쿠키에는 역할만 담는다.
  const users = await userRepository.listByRole(role);
  return users[0] ?? { role, name: role, teacherId: null };
}

/**
 * 페이지용 모듈 접근 가드 — flows GANGSA-G1 그대로:
 * 차단 라우트에 직접 진입하면 **에러가 아니라 허브로 리다이렉트**한다.
 * (미로그인은 로그인 화면으로 — proxy의 1차 방어를 통과한 경우의 최종 방어)
 *
 * 페이지는 이 함수 하나로 사용자·권한을 확정한다.
 */
export async function requireModuleAccess(module: ModuleKey): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user.role, module)) redirect("/");
  return user;
}

/**
 * Server Action용 권한 확인 — 리다이렉트 대신 도메인 에러를 던진다.
 * 액션은 폼 상태로 실패를 돌려줘야 하므로 (설계 §7) 페이지 가드와 분리한다.
 */
export async function assertModuleAccess(module: ModuleKey): Promise<User> {
  const user = await currentUser();
  if (!user) throw new ForbiddenError("로그인이 필요합니다.");
  if (!canAccessModule(user.role, module)) {
    throw new ForbiddenError(`이 모듈에 접근할 권한이 없습니다. (${user.role})`);
  }
  return user;
}

/** 역할 선택 로그인 — 실제 인증 도입 시 자격 검증이 여기 들어온다 */
export async function signIn(role: UserRole): Promise<void> {
  (await cookies()).set(ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(ROLE_COOKIE);
}
