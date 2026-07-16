import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { reservations, sessions } from "../../db/schema";
import { formatReservationCode, reissuedCode, type Reservation } from "@/entities/reservation";
import type { ReservationRepository } from "../reservation.port";

type ReservationRow = typeof reservations.$inferSelect;

const ACTIVE_STATUSES = ["reserved", "entered"] as const;

/** Row→도메인. 스키마 변경이 여기서 컴파일 에러로 드러난다 (설계 §6.1-②) */
function toReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    code: row.code,
    sessionId: row.sessionId,
    studentId: row.studentId,
    name: row.name,
    school: row.school,
    grade: row.grade,
    phone: row.phone,
    channel: row.channel,
    status: row.status,
    attendCount: row.attendCount,
    member: row.member,
    reservedAt: row.reservedAt,
    history: row.history,
    codeHistory: row.codeHistory,
    audit: row.audit,
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

  async findById(id) {
    const rows = await getDb().select().from(reservations).where(eq(reservations.id, id)).limit(1);
    return rows[0] ? toReservation(rows[0]) : null;
  },

  async findByCode(code) {
    const rows = await getDb().select().from(reservations).where(eq(reservations.code, code)).limit(1);
    return rows[0] ? toReservation(rows[0]) : null;
  },

  async listByPhone(phone) {
    const rows = await getDb()
      .select()
      .from(reservations)
      .where(eq(reservations.phone, phone))
      .orderBy(desc(reservations.reservedAt));
    return rows.map(toReservation);
  },

  async listByGroup(groupId) {
    const rows = await getDb().select().from(reservations).where(eq(reservations.groupId, groupId));
    return rows.map(toReservation);
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
    const rows = await getDb()
      .insert(reservations)
      .values({ ...draft, code: await nextCode(draft.sessionId), status: "reserved" })
      .returning();
    return toReservation(rows[0]);
  },

  /** 가족(형제) 동시 생성 — 같은 groupId (명세 12.13). 단일 insert라 원자적 */
  async createGroup(drafts) {
    if (drafts.length === 0) return [];
    const groupId = crypto.randomUUID();
    const values = [];
    for (const draft of drafts) {
      values.push({ ...draft, code: await nextCode(draft.sessionId), status: "reserved" as const, groupId });
    }
    const rows = await getDb().insert(reservations).values(values).returning();
    return rows.map(toReservation);
  },

  async updateStatus(id, status) {
    const rows = await getDb()
      .update(reservations)
      .set({ status })
      .where(eq(reservations.id, id))
      .returning();
    if (!rows[0]) throw new Error(`예약을 찾을 수 없습니다: ${id}`);
    return toReservation(rows[0]);
  },

  async cancel(id, by) {
    const rows = await getDb()
      .update(reservations)
      .set({ status: "cancelled", cancelledBy: by })
      .where(eq(reservations.id, id))
      .returning();
    if (!rows[0]) throw new Error(`예약을 찾을 수 없습니다: ${id}`);
    return toReservation(rows[0]);
  },

  /** 회차 이동 — 예약번호·QR 유지, history 누적 (명세 12.2) */
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

  /** QR 재발급 — 이전 코드는 codeHistory로 (명세 12.12) */
  async reissueCode(id) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        code: reissuedCode(current.code, current.codeHistory.length + 1),
        codeHistory: [...current.codeHistory, current.code],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  /** 입장 취소(롤백) — reserved 복귀 + 사유 (명세 12.12) */
  async rollbackEntry(id, reason) {
    const current = await mustFind(id);
    const rows = await getDb()
      .update(reservations)
      .set({
        status: "reserved",
        audit: [...current.audit, { action: "rollback_entry", reason, when: new Date() }],
      })
      .where(eq(reservations.id, id))
      .returning();
    return toReservation(rows[0]);
  },

  async linkStudent(id, studentId) {
    const rows = await getDb()
      .update(reservations)
      .set({ studentId, member: true })
      .where(eq(reservations.id, id))
      .returning();
    if (!rows[0]) throw new Error(`예약을 찾을 수 없습니다: ${id}`);
    return toReservation(rows[0]);
  },
};
