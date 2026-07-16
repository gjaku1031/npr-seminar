import "server-only";
import { z } from "zod";

/**
 * 서버 env 격리지점 (설계 §3). 클라이언트 노출 env(NEXT_PUBLIC_*)는 shared/config/env.ts —
 * 파일을 분리해 서버 시크릿이 클라이언트 번들로 새는 경로 자체를 없앤다.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  REPO_IMPL: z.enum(["drizzle", "memory"]).optional(),
  /** QR 링크·문자 본문에 쓰는 절대 URL 베이스. 미설정 시 VERCEL_URL → localhost 순 (server/sms/urls.ts) */
  BASE_URL: z.string().min(1).optional(),
  // ── SOLAPI 문자 게이트웨이 (명세 §12 실서비스 전환) ──────────
  SOLAPI_API_KEY: z.string().min(1).optional(),
  SOLAPI_API_SECRET: z.string().min(1).optional(),
  /** 발신번호 — SOLAPI에 사전 등록된 번호만 가능 */
  SOLAPI_SENDER: z.string().min(1).optional(),
  /** 명시 on/off. 미설정 기본값: 프로덕션 배포에서만 발송 (server/sms/gateway.ts) */
  SMS_ENABLED: z.string().optional(),
  SMS_DISABLED: z.string().optional(),
  /** 비프로덕션 오발송 방지 — 쉼표 구분 수신 허용 번호. 비프로덕션 기본 활성 */
  SMS_RECIPIENT_ALLOWLIST: z.string().optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv() {
  cached ??= schema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    REPO_IMPL: process.env.REPO_IMPL,
    BASE_URL: process.env.BASE_URL,
    SOLAPI_API_KEY: process.env.SOLAPI_API_KEY,
    SOLAPI_API_SECRET: process.env.SOLAPI_API_SECRET,
    SOLAPI_SENDER: process.env.SOLAPI_SENDER,
    SMS_ENABLED: process.env.SMS_ENABLED,
    SMS_DISABLED: process.env.SMS_DISABLED,
    SMS_RECIPIENT_ALLOWLIST: process.env.SMS_RECIPIENT_ALLOWLIST,
  });
  return cached;
}

/** 리포지토리 구현 선택 규칙: 명시(REPO_IMPL) > DATABASE_URL 유무 (설계 §9). */
export function resolveRepoImpl(): "drizzle" | "memory" {
  const env = serverEnv();
  return env.REPO_IMPL ?? (env.DATABASE_URL ? "drizzle" : "memory");
}
