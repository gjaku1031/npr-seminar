import "server-only";
import {
  cancelledLogLabel,
  createdLogLabel,
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
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    code: nextCode(draft.sessionId),
    qrToken: crypto.randomUUID(),
    ...draft,
    status: "reserved",
    reservedAt: now,
    scannerNo: null,
    enteredAt: null,
    logs: [{ label: createdLogLabel(draft.channel), at: now }],
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

const digits = (s: string) => s.replace(/\D/g, "");

export const memoryReservationRepository: ReservationRepository = {
  async listBySession(sessionId) {
    return clone(
      [...db().reservations.values()].filter((r) => r.sessionId === sessionId).sort(byReservedDesc),
    );
  },

  async listAll() {
    return clone([...db().reservations.values()].sort(byReservedDesc));
  },

  async findById(id) {
    const row = db().reservations.get(id);
    return row ? clone(row) : null;
  },

  async findByCode(code) {
    const row = [...db().reservations.values()].find((r) => r.code === code);
    return row ? clone(row) : null;
  },

  /** QR 토큰 조회 — 스캔·패스 페이지 (명세 §9.2) */
  async findByQrToken(token) {
    const row = [...db().reservations.values()].find((r) => r.qrToken === token);
    return row ? clone(row) : null;
  },

  /** 연락처 부분 매칭(≥4자리) — 모바일 셀프 조회 (명세 §10.8) */
  async listByPhoneDigits(q) {
    const d = digits(q);
    if (d.length < 4) return [];
    return clone(
      [...db().reservations.values()]
        .filter((r) => digits(r.phone).includes(d))
        .sort(byReservedDesc),
    );
  },

  async listByGroup(groupId) {
    return clone([...db().reservations.values()].filter((r) => r.groupId === groupId));
  },

  /** 학생의 해당 세션 최신 예약 — 명단 드랍다운 상태 (명세 §4.5) */
  async findByStudent(sessionId, studentId) {
    const rows = [...db().reservations.values()]
      .filter((r) => r.sessionId === sessionId && r.studentId === studentId)
      .sort(byReservedDesc);
    return rows[0] ? clone(rows[0]) : null;
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
    const groupId = drafts.length > 1 ? crypto.randomUUID() : null;
    const rows = drafts.map((d) => build(d, groupId));
    for (const row of rows) db().reservations.set(row.id, row);
    return clone(rows);
  },

  /** 입장 — 스캐너 번호·시각 기록 (명세 §4.6 · §9.2) */
  async checkIn(id, scannerNo) {
    const next: Reservation = { ...mustFind(id), status: "entered", scannerNo, enteredAt: new Date() };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 취소 — 행위자 기준 로그 (명세 §11) */
  async cancel(id, by) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      status: "cancelled",
      cancelledBy: by,
      logs: [...row.logs, { label: cancelledLogLabel(by), at: new Date() }],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 재예약(취소 건 되살림) — 관리자 조작 = 수동 예약 로그 (명세 §4.5) */
  async reactivate(id, reservedBy) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      status: "reserved",
      reservedBy,
      cancelledBy: null,
      logs: [...row.logs, { label: "수동 예약", at: new Date() }],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 참석 학부모 지정 — 관리자 조작 로그 (명세 §4.5) */
  async updateReservedBy(id, reservedBy) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      reservedBy,
      logs: [...row.logs, { label: "수동 예약", at: new Date() }],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 예약 제거 — 명단 드랍다운 `-` (명세 §4.5) */
  async remove(id) {
    db().reservations.delete(id);
  },

  /** 회차 이동 — 예약번호·QR 유지, history 누적 (명세 §10.8) */
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

  /** QR 재발급 — 이전 코드는 codeHistory로, QR 토큰도 회전(이전 QR 무효화) */
  async reissueCode(id) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      code: reissuedCode(row.code, row.codeHistory.length + 1),
      qrToken: crypto.randomUUID(),
      codeHistory: [...row.codeHistory, row.code],
    };
    db().reservations.set(id, next);
    return clone(next);
  },

  /** 입장 취소(롤백) — reserved 복귀 + 사유 기록 */
  async rollbackEntry(id, reason) {
    const row = mustFind(id);
    const next: Reservation = {
      ...row,
      status: "reserved",
      scannerNo: null,
      enteredAt: null,
      audit: [...row.audit, { action: "입장 취소", reason, when: new Date() }],
    };
    db().reservations.set(id, next);
    return clone(next);
  },
};
