import "server-only";
import { redirect } from "next/navigation";
import { canAccessModule, type ModuleKey, type User } from "@/entities/user";
import { fetchAdminActor } from "../auth/session";

/**
 * 관리자 콘솔의 서버 측 인증 확인
 *
 * 매 요청 Nest 세션을 확인함(계약 GET /api/v1/auth/me). 브라우저 쿠키 값을 그대로 믿지 않음
 * 호출부는 `(main)` 레이아웃과 각 페이지
 *
 * 판정은 언제나 서버가 Nest 에 되물어 얻은 `role` 로 함. ADMIN 이 아닌 세션(SCANNER
 * 포함)은 콘솔에 존재하지 않는 것과 같음
 */

/**
 * 로그인한 관리자 — 미인증·만료·SCANNER·장애면 null (로그인 화면으로 보냄)
 *
 * 이름은 Nest 가 확인해 준 actor 의 displayName 을 씀 — 화면이 표시하는 신원과
 * 서버가 인증한 신원이 갈라지지 않게 함
 */
export async function currentUser(): Promise<User | null> {
  const actor = await fetchAdminActor();
  if (!actor) return null;

  const name = actor.displayName.trim();
  return { role: "admin", name: name.length > 0 ? name : "관리자" };
}

/**
 * 페이지용 가드 — 단일 관리자라 사실상 로그인 확인임
 * canAccessModule 판정 지점은 유지함. 역할이 늘어나면 여기만 확장
 */
export async function requireModuleAccess(module: ModuleKey): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!canAccessModule(user.role, module)) redirect("/");
  return user;
}
