import "server-only";

/**
 * server 존 공개 API (barrel) — 진입점인 app 페이지(RSC)는 `@/server/services` 로만 들어옴 (ESLint R1)
 *
 * 이 존에 남은 책임은 인증 판정 하나임. 업무 데이터·변경은 전부 브라우저가 same-origin
 * `/api/v1` 로 Nest 에 직접 요청함 (`@/shared/api`). 여기에 새 도메인 로직을 두지 않음
 */

// 인증 이음새 — 판정 권위는 Nest (계약 GET /api/v1/auth/me). 자세한 이유는 auth.service.ts
export { currentUser, requireModuleAccess } from "./auth.service";
