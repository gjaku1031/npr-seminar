import "server-only";
import { and, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { reservations, sessions } from "../../db/schema";
import {
  cancelledLogLabel,
  createdLogLabel,
  formatReservationCode,
  reissuedCode,
  type Reservation,
} from "@/entities/reservation";
import type { ReservationRepository } from "../reservation.port";

type ReservationRow = typeof reservations.$inferSelect;

const ACTIVE_STATUSES = ["reserved", "entered"] as const;

/** jsonb 안의 Date는 문자열(ISO)로 저장·조회된다 — 도메인 타입(Date)으로 복원한다 */
function reviveAt<T extends { [K in F]: Date }, F extends keyof T>(rows: T[], field: F): T[] {
  return rows.map((row) => ({ ...row, [field]: new Date(row[field]) }));
}

/** Row→도메인. 스키마 변경이 여기서 컴파일 에러로 드러난다 (설계 §6.1-②) */
function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    code: row.code,
    qrToken: row.qrToken,
    sessionId: row.sessionId,
    studentId: row.studentId,
    name: row.name,
    school: row.school,
    grade: row.grade,
    className: row.className,
    teacherName: row.teacherName,
    campus: row.campus,
    unit: row.unit,
    phone: row.phone,
    channel: row.channel,
    status: row.status,
    reservedBy: row.reservedBy,
    source: row.source,
    attendCount: row.attendCount,
    member: row.member,
    reservedAt: row.reservedAt,
    scannerNo: row.scannerNo,
    enteredAt: row.enteredAt,
    logs: reviveAt(row.logs, "at"),
    history: reviveAt(row.history, "when"),
    codeHistory: row.codeHistory,
    audit: reviveAt(row.audit, "when"),
    groupId: row.groupId,
    cancelledBy: row.cancelledBy,
  };
}

/**
 * 세션 회차 기준 예약번호 채번 (명세 §2).
 * ⚠️ count 기반 채번은 동시 요청에서 충돌할 수 있다 — code에 unique 제약이 있어 중복은 DB가 거부한다.
 *    시퀀스 테이블로 승격하는 것이 다음 단계 (지금은 뼈대).
 */
async function nextCode(sessionId: string): Promise<string> {
  const db = getDb();
  const [session] = await db
    .select({ round: sessions.round })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reservations)
    .where(eq(reservations.sessionId, sessionId));
  return formatReservationCode(session?.round ?? 1, count + 1);
}

async function mustFind(id: string): Promise<Reservation> {
  const rows = await getDb().select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!rows[0]) throw new Error(`예약을 찾을 수 없습니다: ${id}`);
  return toReservation(rows[0]);
}

export const drizzleReservationRepository: ReservationRepository = {
  async listBySession(sessionId) {
    const rows = await getDb()
      .select()
      .from(reservations)
      .where(eq(reservations.sessionId, sessionId))
      .orderBy(desc(reservations.reservedAt));
    return rows.map(toReservation);
  },

  async listAll() {
    const rows = await getDb().select().from(reservations).orderBy(desc(reservations.reservedAt));
    return rows.map(toReservation);
  },

  async findById(id) {
    const rows = await getDb().select().from(reservations).where(eq(reservations.id, id)).limit(1);
    return rows[0] ? toReservation(rows[0]) : null;
  },

  async findByCode(code) {
    const rows = await getDb().select().from(reservations).where(eq(reservations.code, code)).limit(1);
    return rows[0] ? toReservation(rows[0]) : null;
  },

  /** QR 토큰 조회 — 스캔·패스 페이지 (명세 §9.2) */
  async findByQrToken(token) {
    const rows = await getDb()
      .select()
      .from(reservations)
      .where(eq(reservations.qrToken, token))
      .limit(1);
    return rows[0] ? toReservation(rows[0]) : null;
  },

  /** 연락처 부분 매칭(≥4자리) — 모바일 셀프 조회 (명세 §10.8) */
  async listByPhoneDigits(q) {
    const d = q.replace(/\D/g, "");
    if (d.length < 4) return [];
    // phone은 하이픈 포함 저장 — 숫자만 비교하기 위해 정규화 컬럼식 사용
    const rows = await getDb()
      .select()
      .from(reservations)
      .where(like(sql`regexp_replace(${reservations.phone}, '\\D', '', 'g')`, `%${d}%`))
      .orderBy(desc(reservations.reservedAt));
    return rows.map(toReservation);
  },

  async listByGroup(groupId) {
    const rows = await getDb().select().from(reservations).where(eq(reservations.groupId, groupId));
    return rows.map(toReservation);
  },

  /** 학생의 해당 세션 최신 예약 — 명단 드랍다운 상태 (명세 §4.5) */
  async findByStudent(sessionId, studentId) {
    const rows = await getDb()
      .select()
      .from(reservations)
      .where(and(eq(reservations.sessionId, sessionId), eq(reservations.studentId, studentId)))
      .orderBy(desc(reservations.reservedAt))
      .limit(1);
    return rows[0] ? toReservation(rows[0]) : null;
  },

  /** 중복 판정: 재원생은 studentId, 비재원생은 전화번호 — 유효 건만 (설계 §6.4) */
  async existsActive({ sessionId, studentId, phone }) {
    const identity = studentId
      ? eq(reservations.studentId, studentId)
      : and(isNull(reservations.studentId), eq(reservations.phone, phone));

    const rows = await getDb()
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.sessionId, sessionId),
          inArray(reservations.status, [...ACTIVE_STATUSES]),
          identity,
        ),
      )
      .limit(1);
    return rows.length > 0;
  },

  async countActive(sessionId) {
    const [{ count }] = await getDb()
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(
        and(eq(reservations.sessionId, sessionId), inArray(reservations.status, [...ACTIVE_STATUSES])),
      );
    return count;
  },

  async create(draft) {
    const now = new Date();
    const rows = await getDb()
      .insert(reservations)
      .values({
        ...draft,
        code: await nextCode(draft.sessionId),
        qrToken: crypto.randomUUID(),
        status: "reserved",
        logs: [{ label: createdLogLabel(draft.channel), at: now }],
      })
      .returning();
    return toReservation(rows[0]);
  },

  /** 가족(형제) 동시 생성 — 같은 groupId (명세 §10.5). 단일 insert라 원자적 */
  async createGroup(drafts) {
    if (drafts.length === 0) return [];
    const groupId = drafts.length > 1 ? crypto.randomUUID() : null;
    const now = new Date();
    const values = [];
    for (const draft of drafts) {
      values.push({
        ...draft,
        code: await nextCode(draft.sessionId),
        qrToken: crypto.randomUUID(),
        status: "reserved" as const,
        groupId,
        logs: [{ label: createdLogLabel(draft.channel), at: now }],
      });
    }
    const rows = await getDb().insert(reservations).values(values).returning();
    return rows.map(toReservation);
  },

  /** 입장 — 스캐너 번호·시각 기록 (명세 §4.6 · §9.2) */
  async checkIn(id, scannerNo) {
    const rows = await getDb()
      .update(reservations)
      .set({ status: "entered", scannerNo, enteredAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();
    if (!rows[0]) throw new Error(`예약을 찾을 수 없습니다: ${id}`);
    return toReservation(rows[0]);
  },

  /** 취소 — 행위자 기준 로그 (명세 §11) */
  async cancel(id, by) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        status: "cancelled",
        cancelledBy: by,
        logs: [...current.logs, { label: cancelledLogLabel(by), at: new Date() }],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  /** 재예약(취소 건 되살림) — 관리자 조작 로그 (명세 §4.5) */
  async reactivate(id, reservedBy) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        status: "reserved",
        reservedBy,
        cancelledBy: null,
        logs: [...current.logs, { label: "수동 예약", at: new Date() }],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  /** 참석 학부모 지정 — 관리자 조작 로그 (명세 §4.5) */
  async updateReservedBy(id, reservedBy) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({ reservedBy, logs: [...current.logs, { label: "수동 예약", at: new Date() }] })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  /** 예약 제거 — 명단 드랍다운 `-` (명세 §4.5) */
  async remove(id) {
    await getDb().delete(reservations).where(eq(reservations.id, id));
  },

  /** 회차 이동 — 예약번호·QR 유지, history 누적 (명세 §10.8) */
  async move(id, toSessionId) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        sessionId: toSessionId,
        history: [...current.history, { from: current.sessionId, to: toSessionId, when: new Date() }],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  /** QR 재발급 — 이전 코드는 codeHistory로, QR 토큰도 회전(이전 QR 무효화) */
  async reissueCode(id) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        code: reissuedCode(current.code, current.codeHistory.length + 1),
        qrToken: crypto.randomUUID(),
        codeHistory: [...current.codeHistory, current.code],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  /** 입장 취소(롤백) — reserved 복귀 + 사유 */
  async rollbackEntry(id, reason) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        status: "reserved",
        scannerNo: null,
        enteredAt: null,
        audit: [...current.audit, { action: "입장 취소", reason, when: new Date() }],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },
};
