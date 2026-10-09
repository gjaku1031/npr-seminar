"use client";

/**
 * 관리자 프로젝트 세션 어댑터 (계약 Auth 태그)
 *
 * 계약 경로는 `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` 임
 * (packages/contracts/openapi.yaml §paths, operationId loginProjectSession·logoutProjectSession)
 *
 * CSRF 는 `apiRequest` 가 알아서 부트스트랩함(GET /auth/csrf). 여기서 직접 다루는 것은
 * 세션 identity 가 바뀐 뒤의 토큰 폐기뿐임 — 계약이 로그인 성공 시 세션 ID 재생성을,
 * 로그아웃 시 세션 파기를 규정하므로 두 경우 모두 기존 토큰이 무효가 됨
 *
 * 자격증명은 이 모듈을 통과만 함. 캐시·로그·스토리지에 절대 남기지 않음
 */

import { apiRequest, resetCsrfToken } from "./client";
import type { CurrentActor, LoginRequest } from "./contract";
import { isApiError } from "./problem";

/**
 * 현재 세션 actor를 Nest에서 다시 확인함. 예상 계약과 다르면 오류로 처리함
 */
export async function getCurrentActor(signal?: AbortSignal): Promise<CurrentActor> {
  const actor = await apiRequest<CurrentActor>("/auth/me", { signal });
  if (
    !actor ||
    typeof actor.subjectId !== "string" ||
    typeof actor.displayName !== "string" ||
    (actor.role !== "ADMIN" && actor.role !== "SCANNER")
  ) {
    throw new TypeError("인증 응답 형식이 올바르지 않습니다.");
  }
  return actor;
}

/**
 * durable 변경이라 계약이 Idempotency-Key 를 요구함 — 키는 호출부(useOperationKey)가 소유함
 */
export interface SessionMutationOptions {
  /**
   * 멱등 키
   */
  idempotencyKey: string;

  /**
   * 취소 신호
   */
  signal?: AbortSignal;
}

/**
 * 관리자 로그인. 성공하면 인증된 ADMIN/SCANNER actor 를 돌려줌
 *
 * 성공 직후 CSRF 토큰을 버림 — 계약상 pre-auth 세션 ID 가 재생성되므로
 * 로그인에 쓴 토큰은 이 시점부터 무효임
 */
export async function loginProjectSession(
  credentials: LoginRequest,
  options: SessionMutationOptions,
): Promise<CurrentActor> {
  const actor = await apiRequest<CurrentActor>("/auth/login", {
    method: "POST",
    body: { username: credentials.username, password: credentials.password },
    idempotencyKey: options.idempotencyKey,
    signal: options.signal,
  });

  resetCsrfToken();
  return actor;
}

/**
 * 로그아웃. 계약상 요청 본문은 빈 객체이고 성공은 204 임
 *
 * 이미 세션이 없어 401 이 와도 "로그아웃됨"이라는 목표는 달성된 것이라 성공으로 접음 —
 * 호출부가 로그인 화면으로 보내는 동작이 같기 때문임. 그 밖의 실패는 그대로 던져서
 * 호출부가 조작 키를 유지한 채 재시도할 수 있게 함
 */
export async function logoutProjectSession(options: SessionMutationOptions): Promise<void> {
  try {
    await apiRequest<void>("/auth/logout", {
      method: "POST",
      body: {},
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    });
  } catch (error) {
    if (!isApiError(error) || error.status !== 401) throw error;
  } finally {
    // 성공이면 세션이 파기됐고, 실패여도 토큰 상태를 신뢰할 수 없음 — 어느 쪽이든 버림
    resetCsrfToken();
  }
}
