import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { ConvertedFrom } from "@/entities/student";
import type { ClassLevel } from "@/entities/class";
import type { UserRole } from "@/entities/user";

/**
 * 사람 관련 테이블 — 강사·반·재원생·콘솔 사용자 (명세 §2).
 * Row 타입은 server 존 밖으로 나가지 않는다 (설계 §4.3). jsonb 컬럼은 도메인 타입을 $type으로 고정해
 * 모델이 바뀌면 여기서 컴파일 에러가 나게 한다(조기 감지).
 */

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  level: text("level").$type<ClassLevel>().notNull(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachers.id),
});

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  school: text("school").notNull().default(""),
  grade: text("grade").notNull().default(""),
  classId: uuid("class_id").references(() => classes.id),
  parentPhone: text("parent_phone").notNull(),
  noShowCount: integer("no_show_count").notNull().default(0),
  /** 비재원 → 재원 전환 이력 (명세 12.14) */
  convertedFrom: jsonb("converted_from").$type<ConvertedFrom>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 콘솔 사용자 (명세 12.1). 와이어프레임은 localStorage(`npr-user`)에 역할만 저장했지만,
 * 서버는 실제 계정이 필요하다 — 인증 도입 전까지 역할·이름 시드만 보관 (설계 §8 인증 이음새).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: text("role").$type<UserRole>().notNull(),
  name: text("name").notNull(),
  /** gangsa일 때 담당 강사 — 본인 반 필터링 (flows GANGSA-F5) */
  teacherId: uuid("teacher_id").references(() => teachers.id),
  active: boolean("active").notNull().default(true),
});
