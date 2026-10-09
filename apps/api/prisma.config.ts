import { defineConfig, env } from "prisma/config";

/**
 * migrate 명령 실행 여부. 마이그레이션은 별도 권한 계정 URL 사용
 */
const usesMigrationRole = process.argv.some((argument) => argument === "migrate");

/**
 * Prisma CLI 설정
 *
 * migrate는 MIGRATION_DATABASE_URL, 그 외(generate 등)는 DATABASE_URL 또는 접속하지 않는 자리 값 사용
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // 마이그레이션 명령이 권한이 낮은 애플리케이션 역할로 실행되지 않도록 분리
    // 런타임 코드는 이 파일을 읽지 않고 PrismaService에서 DATABASE_URL만 사용
    url: usesMigrationRole
      ? env("MIGRATION_DATABASE_URL")
      : process.env.DATABASE_URL ?? "postgresql://generate-only:generate-only@127.0.0.1:5432/generate-only",
    ...(process.env.SHADOW_DATABASE_URL === undefined ? {} : { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }),
  },
});
