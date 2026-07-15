import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * 테이블 정의 — Row 타입은 server 존 밖으로 나가지 않는다(도메인 모델과 별개, 설계 §4.3).
 * 변경 시: pnpm db:generate → drizzle/ 에 마이그레이션 SQL 생성 → pnpm db:migrate.
 */
export const seminars = pgTable("seminars", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  speaker: text("speaker").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  status: text("status", { enum: ["draft", "open", "closed"] })
    .notNull()
    .default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
