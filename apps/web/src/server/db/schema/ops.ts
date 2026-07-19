import { boolean, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import type { SurveyRating } from "@/entities/survey";
import type { Campus, CampusScope } from "@/shared/config/campus";

/**
 * 운영 부가 테이블 — 문자·설문·기기 (명세 v4.0 §5 · §6.5 · §9.1).
 * ⚠️ 문자 게이트웨이·실제 QR 인식은 미연동 (명세 §12) — 스키마는 준비하고 발송은 로그 적재까지.
 *
 * v4.0 개편: 상담(counsel_slots·counsel_bookings) 테이블 제거 — 간담회 도메인 보류 (명세 §7).
 * 설문 응답은 9열 테이블 스냅샷 모델로 개편, 발송 로그에 campus, 기기에 scannerNo.
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
    /** 대상 캠퍼스 — 그룹 발송은 캠퍼스 단위(명세 §5.2), 설문 발송은 '전체' (명세 §6.4) */
    campus: text("campus").$type<CampusScope>().notNull(),
    ok: integer("ok").notNull().default(0),
    fail: integer("fail").notNull().default(0),
    /** 리마인드·설문 등 자동 발송 (명세 §5.4) */
    auto: boolean("auto").notNull().default(false),
  },
  (t) => [index("sms_logs_when_idx").on(t.when)],
);

/** 만족도 설문 응답 — 결과 테이블 9열 스냅샷 (명세 §6.5) */
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    campus: text("campus").$type<Campus | "">().notNull().default(""),
    unit: text("unit").notNull().default(""),
    /** 학생명 스냅샷 */
    student: text("student").notNull(),
    className: text("class_name").notNull().default(""),
    teacherName: text("teacher_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    rating: integer("rating").$type<SurveyRating>().notNull(),
    comment: text("comment").notNull().default(""),
    /** 사진 첨부 여부 — 업로드는 목업 (명세 §12) */
    photo: boolean("photo").notNull().default(false),
    photoName: text("photo_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("survey_responses_session_idx").on(t.sessionId)],
);

/** QR 스캐너 기기 — 스캐너 #1~#4 (명세 §9.1) */
export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 설치 위치 — 예: "스캐너 #1 · 송파 입구" */
  label: text("label").notNull(),
  /** 기종 */
  model: text("model").notNull().default(""),
  /** 스캐너 번호 1~4 — 체크인 기록 식별자 (명세 §9.2) */
  scannerNo: integer("scanner_no").notNull(),
  on: boolean("on").notNull().default(false),
  /** 배터리 % — 40 이하 경고 */
  battery: integer("battery").notNull().default(100),
  last: timestamp("last", { withTimezone: true }).notNull().defaultNow(),
});
