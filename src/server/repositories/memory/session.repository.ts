import "server-only";
import { isActiveReservation } from "@/entities/reservation";
import type { Session, SessionStats } from "@/entities/session";
import type { SessionRepository } from "../session.port";
import { clone, db } from "./store";

function statsOf(sessionId: string): SessionStats {
  const rows = [...db().reservations.values()].filter((r) => r.sessionId === sessionId);
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return {
    reserved: count("reserved"),
    entered: count("entered"),
    noShow: count("no_show"),
    cancelled: count("cancelled"),
    active: rows.filter((r) => isActiveReservation(r.status)).length,
  };
}

const byDateDesc = (a: Session, b: Session) => b.date.getTime() - a.date.getTime();

export const memorySessionRepository: SessionRepository = {
  async list() {
    return clone([...db().sessions.values()].sort(byDateDesc));
  },

  async listActive() {
    return clone(
      [...db().sessions.values()].filter((s) => s.active && !s.ended).sort(byDateDesc),
    );
  },

  async findById(id) {
    const row = db().sessions.get(id);
    return row ? clone(row) : null;
  },

  async create(draft) {
    const session: Session = {
      id: crypto.randomUUID(),
      ...draft,
      active: true,
      ended: false,
      reminders: [],
    };
    db().sessions.set(session.id, session);
    return clone(session);
  },

  async update(id, patch) {
    const row = db().sessions.get(id);
    if (!row) throw new Error(`세션을 찾을 수 없습니다: ${id}`);
    const next = { ...row, ...patch };
    db().sessions.set(id, next);
    return clone(next);
  },

  async toggleReminder(sessionId, reminderId, enabled) {
    const row = db().sessions.get(sessionId);
    if (!row) throw new Error(`세션을 찾을 수 없습니다: ${sessionId}`);
    const next = {
      ...row,
      reminders: row.reminders.map((r) => (r.id === reminderId ? { ...r, enabled } : r)),
    };
    db().sessions.set(sessionId, next);
    return clone(next);
  },

  async stats(sessionId) {
    return statsOf(sessionId);
  },

  /** 종료: ended=true + reserved 일괄 no_show + 학생 noShowCount++ (명세 12.4) */
  async endSession(id) {
    const store = db();
    const row = store.sessions.get(id);
    if (!row) throw new Error(`세션을 찾을 수 없습니다: ${id}`);
    store.sessions.set(id, { ...row, ended: true });

    let tagged = 0;
    for (const [resId, res] of store.reservations) {
      if (res.sessionId !== id || res.status !== "reserved") continue;
      store.reservations.set(resId, { ...res, status: "no_show" });
      tagged += 1;
      if (res.studentId) {
        const student = store.students.get(res.studentId);
        if (student) {
          store.students.set(student.id, { ...student, noShowCount: student.noShowCount + 1 });
        }
      }
    }
    return tagged;
  },

  /** 삭제: 세션 + 연동 예약 (명세 §7.7) */
  async deleteWithReservations(id) {
    const store = db();
    let removed = 0;
    for (const [resId, res] of [...store.reservations]) {
      if (res.sessionId !== id) continue;
      store.reservations.delete(resId);
      removed += 1;
    }
    store.sessions.delete(id);
    return removed;
  },
};
