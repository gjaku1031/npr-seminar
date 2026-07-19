import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { serverEnv } from "../config/env";
import * as schema from "./schema";

/**
 * Neon HTTP 드라이버를 아는 유일한 파일.
 * DB 교체 시나리오 ①(같은 Postgres, 다른 호스트 — RDS·self-host 등)은
 * 이 파일의 드라이버(neon-http → node-postgres 등)와 DATABASE_URL만 바뀐다 (설계 §6.2).
 *
 * 지연 초기화: memory 구현으로 구동할 때 DATABASE_URL이 없어도 모듈 로드가 실패하지 않아야 한다.
 */
let cached: ReturnType<typeof createDb> | null = null;

function createDb() {
  const url = serverEnv().DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL이 없습니다. .env.local에 설정하거나 REPO_IMPL=memory로 실행하세요. (docs/architecture.md §9)",
    );
  }
  return drizzle(neon(url), { schema });
}

export function getDb() {
  cached ??= createDb();
  return cached;
}
