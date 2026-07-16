import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { reservations, sessions, students } from "../../db/schema";
import type { SessionRepository } from "../session.port";
import type { Session, SessionStats } from "@/entities/session";

type SessionRow = typeof sessions.$inferSelect;

/**
 * Row→도메인 변환 — 스키마가 바뀌면 "여기서" 컴파일 에러가 난다(조기 감지, 설계 §6.1-②).
 * createdAt 같은 DB 전용 컬럼은 도메인 모델로 새어나가지 않는다.
 */
function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    round: row.round,
    time: row.time,
    place: row.place,
    capacity: row.capacity,
    desc: row.desc,
    attendField: row.attendField,
    active: row.active,
    ended: row.ended,
    reminders: row.reminders,
    banner: row.banner,
    notice: row.notice,
  };
}

export const drizzleSessionRepository: SessionRepository = {
  async list() {
    const rows = await getDb().select().from(sessions).orderBy(desc(sessions.date));
    return rows.map(toSession);
  },

  async listActive() {
    const rows = await getDb()
      .select()
      .from(sessions)
      .where(and(eq(sessions.active, true), eq(sessions.ended, false)))
      .orderBy(desc(sessions.date));
    return rows.map(toSession);
  },

  async findById(id) {
    const rows = await getDb().select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return rows[0] ? toSession(rows[0]) : null;
  },

  async create(draft) {
    const rows = await getDb()
      .insert(sessions)
      .values({ ...draft, active: true, ended: false, reminders: [] })
      .returning();
    return toSession(rows[0]);
  },

  async update(id, patch) {
    const rows = await getDb().update(sessions).set(patch).where(eq(sessions.id, id)).returning();
    if (!rows[0]) throw new Error(`세션을 찾을 수 없습니다: ${id}`);
    return toSession(rows[0]);
  },

  async toggleReminder(sessionId, reminderId, enabled) {
    const current = await this.findById(sessionId);
    if (!current) throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    const next = current.reminders.map((r) => (r.id === reminderId ? { ...r, enabled } : r));
    const rows = await getDb()
      .update(sessions)
      .set({ reminders: next })
      .where(eq(sessions.id, sessionId))
      .returning();
    return toSession(rows[0]);
  },

  /** 상태별 집계를 한 질의로 — 현황 카드 5장이 매번 부르는 경로 (명세 §7.4) */
  async stats(sessionId) {
    const rows = await getDb()
      .select({ status: reservations.status, count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(eq(reservations.sessionId, sessionId))
      .groupBy(reservations.status);

    const get = (s: string) => rows.find((r) => r.status === s)?.count ?? 0;
    const stats: SessionStats = {
      reserved: get("reserved"),
      entered: get("entered"),
      noShow: get("no_show"),
      cancelled: get("cancelled"),
      active: get("reserved") + get("entered"),
    };
    return stats;
  },

  /**
   * 종료: 학생 노쇼 카운트 증가 → 미체크 노쇼 태깅 → 세션 ended (명세 12.4).
   * 순서가 중요하다 — ①이 아직 'reserved'인 행을 세므로 ②보다 먼저 실행돼야 한다.
   *
   * ⚠️ neon-http 드라이버는 대화형 트랜잭션을 지원하지 않아 batch()로 원자 처리한다.
   *    진짜 트랜잭션이 필요해지면 db/client.ts만 neon-serverless(WebSocket)로 교체하면 된다
   *    — 설계 §6.2 시나리오 ①(드라이버 교체)의 범위이고, 이 파일 위로는 영향이 없다.
   */
  async endSession(id) {
    const db = getDb();
    const [, tagged] = await db.batch([
      db.execute(sql`
        UPDATE ${students} SET no_show_count = no_show_count + sub.cnt
        FROM (
          SELECT student_id, COUNT(*)::int AS cnt FROM ${reservations}
          WHERE session_id = ${id} AND status = 'reserved' AND student_id IS NOT NULL
          GROUP BY student_id
        ) AS sub
        WHERE ${students}.id = sub.student_id
      `),
      db
        .update(reservations)
        .set({ status: "no_show" })
        .where(and(eq(reservations.sessionId, id), eq(reservations.status, "reserved")))
        .returning({ id: reservations.id }),
      db.update(sessions).set({ ended: true }).where(eq(sessions.id, id)),
    ]);
    return tagged.length;
  },

  /** 삭제: 예약은 스키마의 onDelete cascade가 함께 지운다 — 단일 statement라 원자적 (명세 §7.7) */
  async deleteWithReservations(id) {
    const db = getDb();
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(eq(reservations.sessionId, id));
    await db.delete(sessions).where(eq(sessions.id, id));
    return count;
  },
};
