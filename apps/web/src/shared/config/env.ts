/**
 * 클라이언트 노출 env 격리지점 — NEXT_PUBLIC_* 만 이 파일에 (설계 §3).
 * 서버 env(DATABASE_URL 등)는 src/server/config/env.ts — 파일 분리로
 * 서버 시크릿이 클라이언트 번들에 새는 경로 자체를 없앤다.
 */
export const publicEnv = {} as const;
