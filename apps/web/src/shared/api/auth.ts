"use client";

/**
 * 관리자 프로젝트 세션 어댑터 (계약 Auth 태그).
 *
 * 계약 경로는 `POST /api/v1/auth/login` · `POST /api/v1/auth/logout` 이다
 * (packages/contracts/openapi.yaml §paths, operationId loginProjectSession·logoutProjectSession).
 *
 * CSRF 는 `apiRequest` 가 알아서 부트스트랩한다(GET /auth/csrf). 여기서 직접 다루는 것은
 * **세션 identity 가 바뀐 뒤의 토큰 폐기**뿐이다 — 계약이 로그인 성공 시 세션 ID 재생성을,
 * 로그아웃 시 세션 파기를 규정하므로 두 경우 모두 기존 토큰이 무효가 된다.
 *
 * 자격증명은 이 모듈을 통과만 한다. 캐시·로그·스토리지에 절대 남기지 않는다.
 */

import { apiRequest, resetCsrfToken } from "./client";
import type { CurrentActor, LoginRequest } from "./contract";
import { isApiError } from "./problem";

/** durable 변경이라 계약이 Idempotency-Key 를 요구한다 — 키는 호출부(useOperationKey)가 소유한다. */
export interface SessionMutationOptions {
  idempotencyKey: string;
  signal?: AbortSignal;
}

/**
 * 관리자 로그인. 성공하면 인증된 ADMIN/SCANNER actor 를 돌려준다.
 *
 * 성공 직후 CSRF 토큰을 버린다 — 계약상 pre-auth 세션 ID 가 재생성되므로
 * 로그인에 쓴 토큰은 이 시점부터 무효다.
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
 * 로그아웃. 계약상 요청 본문은 빈 객체이고 성공은 204 다.
 *
 * 이미 세션이 없어 401 이 와도 "로그아웃됨"이라는 목표는 달성된 것이라 성공으로 접는다 —
 * 호출부가 로그인 화면으로 보내는 동작이 같기 때문이다. 그 밖의 실패는 그대로 던져서
 * 호출부가 조작 키를 유지한 채 재시도할 수 있게 한다.
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
    // 성공이면 세션이 파기됐고, 실패여도 토큰 상태를 신뢰할 수 없다 — 어느 쪽이든 버린다.
    resetCsrfToken();
  }
}
