import { boolean, date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { BannerTheme, Reminder } from "@/entities/session";

/**
 * 설명회 테이블 (명세 §2 · §7).
 * date와 time을 분리 보관한다 — 명세 §2 원본 구조.
 * ⚠️ 명세 §7.2가 지적한 공백: 와이어프레임에 시작 시각 입력 필드가 없어 10:00 고정. 서버는 값을 받는다.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  date: date("date", { mode: "date" }).notNull(),
  round: integer("round").notNull().default(1),
  /** "HH:mm" */
  time: text("time").notNull().default("10:00"),
  place: text("place").notNull(),
  capacity: integer("capacity").notNull(),
  desc: text("desc").notNull().default(""),
  /** true면 예약 시 참석 인원(1~4) 수집 (명세 §5.6 · 10.3) */
  attendField: boolean("attend_field").notNull().default(false),
  active: boolean("active").notNull().default(true),
  /** 종료 처리됨 — 미체크가 노쇼로 태깅된 상태 (명세 12.4) */
  ended: boolean("ended").notNull().default(false),
  /** 리마인드 스케줄 (명세 12.5) — 세션 종속이라 내장 */
  reminders: jsonb("reminders").$type<Reminder[]>().notNull().default([]),
  banner: text("banner").$type<BannerTheme>().notNull().default("navy"),
  notice: text("notice").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
