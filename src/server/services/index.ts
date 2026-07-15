import "server-only";

/**
 * server 존 공개 API (barrel) — 진입점(app 페이지·Server Action)은 @/server/services 로만
 * 들어온다 (ESLint R1). 리포지토리·db는 여기서 재노출하지 않는다.
 */
export { listSeminars, getSeminar, createSeminar } from "./seminar.service";
