import { boolean, date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { BannerTheme } from "@/entities/session";
import type { CampusScope } from "@/shared/config/campus";

/**
 * 설명회 테이블 (명세 v4.0 §2 · §6).
 * date와 time을 분리 보관한다 — 명세 §2 원본 구조.
 * ⚠️ 명세 §6.2가 지적한 공백: 생성 모달에 시작 시각 입력이 없어 10:00 고정. 서버는 값을 받는다.
 *
 * v4.0 개편: campus 범위·surveySms(만족도 설문 문자) 추가, 리마인드(reminders jsonb) 삭제.
 */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  /** '전체' 또는 특정 캠퍼스 — 모바일 노출 범위 (명세 §10.1) */
  campus: text("campus").$type<CampusScope>().notNull().default("전체"),
  date: date("date", { mode: "date" }).notNull(),
  round: integer("round").notNull().default(1),
  /** "HH:mm" */
  time: text("time").notNull().default("10:00"),
  place: text("place").notNull(),
  capacity: integer("capacity").notNull(),
  desc: text("desc").notNull().default(""),
  /** true면 예약 시 참석 학부모(모/부)·참석 인원 수집 (명세 §10.4) */
  attendField: boolean("attend_field").notNull().default(false),
  active: boolean("active").notNull().default(true),
  /** 종료 처리됨 — 미체크가 내부 노쇼로 태깅된 상태 (명세 §6.6) */
  ended: boolean("ended").notNull().default(false),
  banner: text("banner").$type<BannerTheme>().notNull().default("violet"),
  notice: text("notice").notNull().default(""),
  /** 만족도 설문 문자 본문 (명세 §6.4) */
  surveySms: text("survey_sms").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
