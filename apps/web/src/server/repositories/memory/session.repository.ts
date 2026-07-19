import "server-only";
import { isActiveReservation } from "@/entities/reservation";
import type { Session, SessionStats } from "@/entities/session";
import { DEFAULT_SURVEY_SMS } from "@/entities/session";
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
    return clone([...db().sessions.values()].filter((s) => s.active && !s.ended).sort(byDateDesc));
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
      surveySms: DEFAULT_SURVEY_SMS,
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

  /** 설문 문자 본문 저장 (명세 §6.4) */
  async updateSurveySms(id, surveySms) {
    const row = db().sessions.get(id);
    if (!row) throw new Error(`세션을 찾을 수 없습니다: ${id}`);
    const next = { ...row, surveySms };
    db().sessions.set(id, next);
    return clone(next);
  },

  async stats(sessionId) {
    return statsOf(sessionId);
  },

  /** 종료: ended=true + reserved 일괄 no_show — 내부 집계, 명단 미표기 (명세 §6.6) */
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
    }
    return tagged;
  },

  /** 삭제: 세션 + 연동 예약 (명세 §6.7) */
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
