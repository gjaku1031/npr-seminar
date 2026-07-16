import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { teachers } from "./people";
import type { SurveyRating } from "@/entities/survey";

/**
 * 운영 부가 테이블 — 문자·설문·상담·기기 (명세 §6 · 12.7 · 12.10 · §8.1).
 * ⚠️ 문자 게이트웨이·실제 QR 인식은 미연동 (명세 §11) — 스키마는 준비하고 발송은 로그 적재까지가 현재 범위.
 */

export const smsTemplates = pgTable("sms_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  body: text("body").notNull().default(""),
});

/** 발송 로그. template·session은 발송 시점 스냅샷(문자열) — 원본이 바뀌어도 로그는 당시를 남긴다 */
export const smsLogs = pgTable(
  "sms_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    when: timestamp("when", { withTimezone: true }).notNull().defaultNow(),
    /** 수신 인원 수 */
    to: integer("to").notNull().default(0),
    template: text("template").notNull(),
    session: text("session").notNull().default(""),
    ok: integer("ok").notNull().default(0),
    fail: integer("fail").notNull().default(0),
    /** 리마인드 등 자동 발송 (명세 12.5) */
    auto: boolean("auto").notNull().default(false),
  },
  (t) => [index("sms_logs_when_idx").on(t.when)],
);

export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    rating: integer("rating").$type<SurveyRating>().notNull(),
    helpful: text("helpful").notNull().default(""),
    again: text("again").notNull().default(""),
    comment: text("comment").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("survey_responses_session_idx").on(t.sessionId)],
);

export const counselSlots = pgTable(
  "counsel_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id),
    date: date("date", { mode: "date" }).notNull(),
    /** "HH:mm" */
    time: text("time").notNull(),
    booked: boolean("booked").notNull().default(false),
  },
  (t) => [index("counsel_slots_teacher_idx").on(t.teacherId, t.date)],
);

export const counselBookings = pgTable("counsel_bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  slotId: uuid("slot_id")
    .notNull()
    .references(() => counselSlots.id),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachers.id),
  date: date("date", { mode: "date" }).notNull(),
  time: text("time").notNull(),
  name: text("name").notNull(),
  grade: text("grade").notNull().default(""),
  phone: text("phone").notNull(),
  /** 유입 설명회 (명세 12.10) */
  from: uuid("from_session_id").references(() => sessions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** QR 스캐너 기기 — 최대 4대 (명세 §8.1) */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 설치 위치 */
  label: text("label").notNull(),
  /** 기종 */
  model: text("model").notNull().default(""),
  on: boolean("on").notNull().default(false),
  /** 배터리 % — 40 이하 경고 */
  battery: integer("battery").notNull().default(100),
  last: timestamp("last", { withTimezone: true }).notNull().defaultNow(),
});
