/**
 * Server Action 공통 상태·헬퍼 (설계 §7).
 * 실패는 throw가 아니라 상태로 반환한다 — 폼 UX(useActionState)가 그대로 렌더할 수 있게.
 *
 * server 존이 아니라 shared/lib에 둔다: 액션(features)과 폼(ui) 양쪽이 타입을 공유해야 하고,
 * 순수 타입·순수 함수라 클라이언트 번들에 들어가도 안전하다.
 */

export type ActionState<T = undefined> =
  | { status: "idle" }
  | { status: "error"; message: string; code?: string }
  | { status: "success"; message?: string; data?: T };

export const idleState: ActionState<never> = { status: "idle" };

export function errorState(message: string, code?: string): ActionState<never> {
  return { status: "error", message, code };
}

export function successState<T>(data?: T, message?: string): ActionState<T> {
  return { status: "success", data, message };
}
