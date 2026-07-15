import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit은 Next와 달리 .env.local을 자동 로드하지 않는다.
loadEnv({ path: ".env.local" });
loadEnv();

export default defineConfig({
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // db:generate는 DB 접속 불필요. db:migrate / db:studio에서만 사용된다.
    url: process.env.DATABASE_URL ?? "",
  },
});
