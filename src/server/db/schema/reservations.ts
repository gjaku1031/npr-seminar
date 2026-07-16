import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { students } from "./people";
import type {
  CancelledBy,
  ReservationAudit,
  ReservationChannel,
  ReservationHistory,
  ReservationStatus,
} from "@/entities/reservation";

/**
 * 예약 테이블 (명세 §2 · §5) — 시스템의 중심.
 *
 * 인덱스 설계 근거:
 * - sessionIdx: 세션별 목록·집계가 거의 모든 화면의 기본 질의 (§5.3 · §7.4 · §7.5)
 * - phoneIdx: 모바일 예약 조회(연락처)·현장 입장(뒷자리) 경로 (§8.6 · 10.2 · 12.3)
 * - codeUniq: 예약번호는 QR·조회 키 — 유일해야 한다. 재발급 시 코드가 바뀌므로 이력은 codeHistory에
 * - groupIdx: 가족(형제) 묶음 조회 (12.13)
 */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `NPR-SSx-0000`, 재발급 시 `-Rn` (명세 12.12) */
    code: text("code").notNull(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** 재원생이면 학생 id, 비재원생이면 null */
    studentId: uuid("student_id").references(() => students.id),
    name: text("name").notNull(),
    school: text("school").notNull().default(""),
    grade: text("grade").notNull().default(""),
    phone: text("phone").notNull(),
    channel: text("channel").$type<ReservationChannel>().notNull(),
    status: text("status").$type<ReservationStatus>().notNull().default("reserved"),
    attendCount: integer("attend_count").notNull().default(1),
    member: boolean("member").notNull().default(true),
    /** 예약 접수 시각 (명세 §2 원본 필드명 `time`) */
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
    /** 회차 이동 이력 (명세 12.2) */
    history: jsonb("history").$type<ReservationHistory[]>().notNull().default([]),
    /** 재발급 이전 코드 (명세 12.12) */
    codeHistory: jsonb("code_history").$type<string[]>().notNull().default([]),
    /** 입장 취소 등 되돌림 사유 (명세 12.12) */
    audit: jsonb("audit").$type<ReservationAudit[]>().notNull().default([]),
    /** 가족(형제) 동시 예약 묶음 (명세 12.13) */
    groupId: uuid("group_id"),
    cancelledBy: text("cancelled_by").$type<CancelledBy>(),
  },
  (t) => [
    uniqueIndex("reservations_code_uniq").on(t.code),
    index("reservations_session_idx").on(t.sessionId),
    index("reservations_phone_idx").on(t.phone),
    index("reservations_group_idx").on(t.groupId),
  ],
);
