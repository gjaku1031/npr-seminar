import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./sessions";
import { students } from "./people";
import type {
  CancelledBy,
  ReservationAudit,
  ReservationChannel,
  ReservationHistory,
  ReservationLog,
  ReservationSource,
  ReservationStatus,
  ReservedBy,
} from "@/entities/reservation";
import type { Campus } from "@/shared/config/campus";

/**
 * 예약 테이블 (명세 v4.0 §2 · §4) — 시스템의 중심.
 *
 * v4.0 개편: reservedBy(참석 학부모)·source(경로)·scannerNo/enteredAt(입장 열)·
 * logs(행위자 기준 이력)·반명/담임명/캠퍼스/단위 스냅샷 추가. channel은 2종(mobile|manual).
 *
 * 인덱스 설계 근거:
 * - sessionIdx: 세션별 목록·집계가 거의 모든 화면의 기본 질의 (§4 · §6.3)
 * - phoneIdx: 모바일 예약 조회(연락처)·비재원 중복 차단 경로 (§10.6 · §10.8)
 * - codeUniq: 예약번호는 QR·조회 키 — 유일해야 한다. 재발급 시 코드가 바뀌므로 이력은 codeHistory에
 * - studentSessionIdx: 명단 드랍다운 상태·재원생 중복 차단 (§4.5, 설계 §6.4)
 * - groupIdx: 가족(형제) 묶음 조회 (§10.5)
 */
export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `NPR-SSx-0000`, 재발급 시 `-Rn` */
    code: text("code").notNull(),
    /** 입장 QR 토큰 — 난수 발급, `/q/{token}` 링크·스캔 키 (API 명세 §0-5). 재발급 시 회전 */
    qrToken: text("qr_token").notNull(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** 재원생이면 학생 id, 비재원생이면 null */
    studentId: uuid("student_id").references(() => students.id),
    name: text("name").notNull(),
    school: text("school").notNull().default(""),
    grade: text("grade").notNull().default(""),
    /** 반명 스냅샷 — 비재원생은 "비재원생" (명세 §4.8) */
    className: text("class_name").notNull().default("비재원생"),
    teacherName: text("teacher_name").notNull().default(""),
    campus: text("campus").$type<Campus | "">().notNull().default(""),
    unit: text("unit").notNull().default(""),
    phone: text("phone").notNull(),
    channel: text("channel").$type<ReservationChannel>().notNull(),
    status: text("status").$type<ReservationStatus>().notNull().default("reserved"),
    /** 참석 학부모 모/부/모,부 — 빈 문자열 = 미지정 (명세 §4.5 · §10.4) */
    reservedBy: text("reserved_by").$type<ReservedBy>().notNull().default(""),
    /** 예약 경로 — 웹앱/수동/전화예약/선생님 예약/현장 예약 (명세 §2) */
    source: text("source").$type<ReservationSource>().notNull().default("수동"),
    attendCount: integer("attend_count").notNull().default(1),
    member: boolean("member").notNull().default(true),
    /** 예약 접수 시각 (명세 §2 원본 필드명 `time`) */
    reservedAt: timestamp("reserved_at", { withTimezone: true }).notNull().defaultNow(),
    /** 입장 처리한 스캐너 번호 — 입장 열 `#N ↵ 시각` (명세 §4.6) */
    scannerNo: integer("scanner_no"),
    enteredAt: timestamp("entered_at", { withTimezone: true }),
    /** 행위자 기준 이력 — 웹앱/수동 예약·취소 (명세 §4.7 · §11) */
    logs: jsonb("logs").$type<ReservationLog[]>().notNull().default([]),
    /** 회차 이동 이력 (명세 §10.8) */
    history: jsonb("history").$type<ReservationHistory[]>().notNull().default([]),
    /** 재발급 이전 코드 */
    codeHistory: jsonb("code_history").$type<string[]>().notNull().default([]),
    /** 입장 취소 등 되돌림 사유 */
    audit: jsonb("audit").$type<ReservationAudit[]>().notNull().default([]),
    /** 가족(형제) 동시 예약 묶음 (명세 §10.5) */
    groupId: uuid("group_id"),
    cancelledBy: text("cancelled_by").$type<CancelledBy>(),
  },
  (t) => [
    uniqueIndex("reservations_code_uniq").on(t.code),
    // QR 스캔 조회 키 — 토큰은 유일해야 한다 (명세 §9.2)
    uniqueIndex("reservations_qr_token_uniq").on(t.qrToken),
    index("reservations_session_idx").on(t.sessionId),
    index("reservations_phone_idx").on(t.phone),
    index("reservations_student_session_idx").on(t.sessionId, t.studentId),
    index("reservations_group_idx").on(t.groupId),
  ],
);
