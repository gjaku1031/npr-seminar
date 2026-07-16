import "server-only";
import {
  formatReservationCode,
  isActiveReservation,
  reissuedCode,
  type Reservation,
  type ReservationDraft,
} from "@/entities/reservation";
import type { ReservationRepository } from "../reservation.port";
import { clone, db } from "./store";

/** 세션 회차 기준 예약번호 채번 (명세 §2 code 패턴) */
function nextCode(sessionId: string): string {
  const store = db();
  const round = store.sessions.get(sessionId)?.round ?? 1;
  const seq = (store.codeSeq.get(sessionId) ?? 0) + 1;
  store.codeSeq.set(sessionId, seq);
  return formatReservationCode(round, seq);
}

function build(draft: ReservationDraft, groupId: string | null): Reservation {
  return {
    id: crypto.randomUUID(),
    code: nextCode(draft.sessionId),
    ...draft,
    status: "reserved",
    reservedAt: new Date(),
    history: [],
    codeHistory: [],
    audit: [],
    groupId,
    cancelledBy: null,
  };
}

function mustFind(id: string): Reservation {
  const row = db().reservations.get(id);
  if (!row) throw new Error(`예약을 찾을 수 없습니다: ${id}`);
  return row;
}

const byReservedDesc = (a: Reservation, b: Reservation) =>
  b.reservedAt.getTime() - a.reservedAt.getTime();

export const memoryReservationRepository: ReservationRepository = {
  async listBySession(sessionId) {
    return clone(
      [...db().reservations.values()].filter((r) => r.sessionId === sessionId).sort(byReservedDesc),
    );
  },

  async findById(id) {
    const row = db().reservations.get(id);
    return row ? clone(row) : null;
  },

  async findByCode(code) {
    const row = [...db().reservations.values()].find((r) => r.code === code);
    return row ? clone(row) : null;
  },

  async listByPhone(phone) {
    return clone([...db().reservations.values()].filter((r) => r.phone === phone).sort(byReservedDesc));
  },

  async listByGroup(groupId) {
    return clone([...db().reservations.values()].filter((r) => r.groupId === groupId));
  },

  /** 중복 판정: 재원생은 studentId, 비재원생은 전화번호 — 유효 건만 (설계 §6.4) */
  async existsActive({ sessionId, studentId, phone }) {
    return [...db().reservations.values()].some((r) => {
      if (r.sessionId !== sessionId || !isActiveReservation(r.status)) return false;
      return studentId ? r.studentId === studentId : r.studentId === null && r.phone === phone;
    });
  },

  async countActive(sessionId) {
    return [...db().reservations.values()].filter(
      (r) => r.sessionId === sessionId && isActiveReservation(r.status),
    ).length;
  },

  async create(draft) {
    const row = build(draft, null);
    db().reservations.set(row.id, row);
    return clone(row);
  },

  async createGroup(drafts) {
    const groupId = crypto.randomUUID();
    const rows = drafts.map((d) => build(d, groupId));
    for (const row of rows) db().reservations.set(row.id, row);
    return clone(rows);
  },

  async updateStatus(id, status) {
    const next = { ...mustFind(id), status };
    db().reservations.set(id, next);
    return clone(next);
  },

  async cancel(id, by) {
    const next: Reservation = { ...mustFind(id), status: "cancelled", cancelledBy: by };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 회차 이동 — 예약번호·QR 유지, history 누적 (명세 12.2) */
  async move(id, toSessionId) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      sessionId: toSessionId,
      history: [...row.history, { from: row.sessionId, to: toSessionId, when: new Date() }],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** QR 재발급 — 이전 코드는 codeHistory로 (명세 12.12) */
  async reissueCode(id) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      code: reissuedCode(row.code, row.codeHistory.length + 1),
      codeHistory: [...row.codeHistory, row.code],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 입장 취소(롤백) — reserved 복귀 + 사유 기록 (명세 12.12) */
  async rollbackEntry(id, reason) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      status: "reserved",
      audit: [...row.audit, { action: "rollback_entry", reason, when: new Date() }],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  async linkStudent(id, studentId) {
    const next: Reservation = { ...mustFind(id), studentId, member: true };
    db().reservations.set(id, next);
    return clone(next);
  },
};
