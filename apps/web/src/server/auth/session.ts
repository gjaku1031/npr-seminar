import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { CurrentActor } from "@/shared/api";
import { serverEnv } from "../config/env";

/**
 * 인증의 유일한 권위 지점 — 계약 GET /api/v1/auth/me (operationId getCurrentActor)
 *
 * ── 왜 쿠키 존재로 판정하지 않는가 ────────────────────────────────────────────
 * 계약상 GET /api/v1/auth/csrf 는 `security: []` 이고 pre-auth 세션 쿠키를 발급함
 * 즉 로그인하지 않은 방문자도 정상적인 세션 쿠키를 가짐. 따라서 "쿠키가 있다"는
 * 익명 방문자와 관리자를 전혀 구분하지 못함 — 쿠키 존재는 인증이 아님
 *
 * 세션은 Redis 가 소유하는 불투명한 ID라 이 앱은 값을 해석할 수 없음. 판정할 수 있는
 * 주체는 Nest 뿐이므로, 매 요청 /auth/me 에 되물어 `role` 을 확인함
 */

const ME_PATH = "/api/v1/auth/me";

/**
 * Nest origin 해석
 *
 * 1) NEST_API_ORIGIN 이 있으면 그대로 씀 (명시적 신뢰)
 * 2) 없으면 요청 헤더로 자기 origin 을 복원해 same-origin 으로 부름 — 앞단 프록시가
 *    `/api/v1` 을 Nest 로 넘기는 배포용 폴백임
 *
 * ⚠️ 폴백은 헤더에서 호스트를 읽으므로, 이 값을 신뢰하는 만큼만 안전함. 브라우저는
 * 크로스 오리진에서 `x-forwarded-host` 를 붙일 수 없어 실사용 위협은 아니지만,
 * 세션 쿠키를 실어 보내는 요청이므로 운영에서는 NEST_API_ORIGIN 을 명시하는 편이 나음
 */
async function resolveApiOrigin(requestHeaders: Headers): Promise<string | null> {
  const configured = serverEnv().NEST_API_ORIGIN;
  if (configured) return configured.replace(/\/+$/, "");

  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) return null;

  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}

/**
 * 계약 CurrentActor 최소 검증 — 형태가 어긋나면 인증으로 인정하지 않음
 */
function parseActor(value: unknown): CurrentActor | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.role !== "ADMIN" && candidate.role !== "SCANNER") return null;
  if (typeof candidate.subjectId !== "string" || typeof candidate.displayName !== "string") return null;
  return candidate as unknown as CurrentActor;
}

/**
 * 현재 세션 actor. 미인증·만료·무효·장애는 전부 null 임
 *
 * 실패를 null 로 접는 이유: 이 함수의 결과는 "들여보낼지" 하나를 정함. 확인하지 못한
 * 세션을 통과시키면 그게 곧 인증 우회이므로, 모르면 막는 쪽이 유일하게 안전한 기본값임
 *
 * `cache()` 는 한 요청의 렌더 패스 안에서만 중복 호출을 접음(요청 간 공유가 아님)
 * 레이아웃 가드와 각 페이지의 requireModuleAccess 가 같은 렌더에서 함께 물어보므로,
 * 왕복이 줄고 무엇보다 한 화면이 서로 다른 actor 를 보는 일이 없어짐
 * fetch 자체는 `no-store` 라 세션 판정이 요청을 넘어 재사용되지 않음
 */
const fetchCurrentActor = cache(async (): Promise<CurrentActor | null> => {
  const requestHeaders = await headers();

  // 쿠키가 아예 없으면 세션도 없음 — 왕복을 아낌. (쿠키 '존재'를 인증으로 쓰는 것이 아니라,
  // 없을 때만 확실히 미인증이라는 한 방향 추론임.)
  const cookie = requestHeaders.get("cookie");
  if (!cookie) return null;

  const origin = await resolveApiOrigin(requestHeaders);
  if (!origin) return null;

  let response: Response;
  try {
    response = await fetch(`${origin}${ME_PATH}`, {
      method: "GET",
      // 세션 쿠키만 넘김. 그 밖의 요청 헤더는 전달하지 않음
      headers: { accept: "application/json", cookie },
      // 세션 판정은 절대 캐시하지 않음 — 사용자 간 응답 공유는 곧 세션 혼선임
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    return parseActor(await response.json());
  } catch {
    return null;
  }
});

/**
 * 콘솔 입장 자격이 있는 actor — ADMIN 만
 *
 * SCANNER 세션은 유효한 세션이지만 관리자 콘솔의 주체가 아님. 게이트 스태프의 iPad 가
 * 페어링 코드만으로 얻는 세션이므로, 이것이 콘솔을 열면 페어링 코드가 곧 관리자 권한이 됨
 */
export async function fetchAdminActor(): Promise<CurrentActor | null> {
  const actor = await fetchCurrentActor();
  return actor?.role === "ADMIN" ? actor : null;
}
