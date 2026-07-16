import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { UserRole } from "@/entities/user";
import type { Campus } from "@/shared/config/campus";

/**
 * 사람 관련 테이블 — 강사·반·재원생·콘솔 사용자 (명세 v4.0 §2).
 * Row 타입은 server 존 밖으로 나가지 않는다 (설계 §4.3).
 *
 * v4.0 개편: 반·재원생에 캠퍼스·단위·담임명, 재원생에 학번·모/부 연락처.
 * 반명·담임명·단위는 명세 모델 그대로 스냅샷 보관 — 화면(11열 테이블)이 직접 표시한다.
 * 제거: 부문(level)·noShowCount·convertedFrom(전환 폐기)·역할 3종(단일 관리자).
 */

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** 반명 — 단위를 결정한다 (명세 §2.1 unitOf) */
  name: text("name").notNull(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => teachers.id),
  teacherName: text("teacher_name").notNull().default(""),
  campus: text("campus").$type<Campus>().notNull(),
  /** unitOf(name) 파생값 — 시드·생성 시 계산해 보관 */
  unit: text("unit").notNull().default(""),
});

export const students = pgTable(
  "students",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 학번 (명세 §4.4) */
    no: text("no").notNull(),
    name: text("name").notNull(),
    school: text("school").notNull().default(""),
    grade: text("grade").notNull().default(""),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id),
    className: text("class_name").notNull(),
    teacherName: text("teacher_name").notNull().default(""),
    campus: text("campus").$type<Campus>().notNull(),
    unit: text("unit").notNull().default(""),
    motherPhone: text("mother_phone").notNull(),
    fatherPhone: text("father_phone").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // 모바일 조회·현장 입장은 모/부 모두 매칭 (명세 §9.3 · §10.3)
    index("students_mother_phone_idx").on(t.motherPhone),
    index("students_father_phone_idx").on(t.fatherPhone),
  ],
);

/**
 * 콘솔 사용자 — 단일 관리자 (명세 §1.1).
 * 실제 인증 도입 전까지 이름 시드만 보관 (설계 §8 인증 이음새).
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  role: text("role").$type<UserRole>().notNull().default("admin"),
  name: text("name").notNull(),
});
