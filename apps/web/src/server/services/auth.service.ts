import "server-only";
import { redirect } from "next/navigation";
import { canAccessModule, type ModuleKey, type User } from "@/entities/user";
import { fetchAdminActor } from "../auth/session";
import { ForbiddenError } from "./errors";

/**
 * ★ 인증 이음새 (설계 §8) ★ — 명세 v4.0 §1.1 · flows ADMIN-F1.
 *
 * 이 파일이 예고했던 교체가 실제로 일어난 지점이다: 예전 구현은 위조 가능한 `npr-user`
 * 쿠키를 읽었고("쿠키를 위조하면 입장할 수 있다"), 이제는 Nest 프로젝트 세션을 매 요청
 * 확인한다 (계약 GET /api/v1/auth/me). 호출부(페이지·액션)는 그대로다 — 예고대로
 * 이 파일 내부만 바뀌었다.
 *
 * 판정은 언제나 서버가 Nest 에 되물어 얻은 `role` 로 한다. ADMIN 이 아닌 세션(SCANNER
 * 포함)은 콘솔에 존재하지 않는 것과 같다.
 */

/**
 * 로그인한 관리자 — 미인증·만료·SCANNER·장애면 null (로그인 화면으로 보낸다).
 *
 * 이름은 Nest 가 확인해 준 actor 의 displayName 을 쓴다 — 화면이 표시하는 신원과
 * 서버가 인증한 신원이 갈라지지 않게 한다.
 */
export async function currentUser(): Promise<User | null> {
  const actor = await fetchAdminActor();
  if (!actor) return null;

  const name = actor.displayName.trim();
  return { role: "admin", name: name.length > 0 ? name : "관리자" };
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
