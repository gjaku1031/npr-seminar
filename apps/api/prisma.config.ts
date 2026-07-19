import { defineConfig, env } from "prisma/config";

const usesMigrationRole = process.argv.some((argument) => argument === "migrate");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migration commands must never accidentally run with the lower-privilege
    // application role. Runtime code does not load this file and uses only
    // DATABASE_URL through PrismaService.
    url: usesMigrationRole
      ? env("MIGRATION_DATABASE_URL")
      : process.env.DATABASE_URL ?? "postgresql://generate-only:generate-only@127.0.0.1:5432/generate-only",
    ...(process.env.SHADOW_DATABASE_URL === undefined ? {} : { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }),
  },
});
