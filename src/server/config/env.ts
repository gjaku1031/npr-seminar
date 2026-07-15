import "server-only";
import { z } from "zod";

/**
 * 서버 env 격리지점 (설계 §3). 클라이언트 노출 env(NEXT_PUBLIC_*)는 shared/config/env.ts —
 * 파일을 분리해 서버 시크릿이 클라이언트 번들로 새는 경로 자체를 없앤다.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  REPO_IMPL: z.enum(["drizzle", "memory"]).optional(),
});

let cached: z.infer<typeof schema> | null = null;

export function serverEnv() {
  cached ??= schema.parse({
    DATABASE_URL: process.env.DATABASE_URL,
    REPO_IMPL: process.env.REPO_IMPL,
  });
  return cached;
}

/** 리포지토리 구현 선택 규칙: 명시(REPO_IMPL) > DATABASE_URL 유무 (설계 §9). */
export function resolveRepoImpl(): "drizzle" | "memory" {
  const env = serverEnv();
  return env.REPO_IMPL ?? (env.DATABASE_URL ? "drizzle" : "memory");
}
