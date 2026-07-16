import "server-only";
import { canCheckIn, canRollback, type Reservation, type ReservationDraft } from "@/entities/reservation";
import { isFull } from "@/entities/session";
import type { CancelledBy } from "@/entities/reservation";
import { reservationRepository, sessionRepository, studentRepository } from "../repositories";
import {
  CapacityExceededError,
  DuplicateReservationError,
  InvalidStateError,
  NotFoundError,
} from "./errors";

/**
 * 예약 유스케이스 — 시스템의 중심. 리포지토리 "계약"만 안다(drizzle 금지, ESLint R2).
 *
 * ★ 서버 불변식 (설계 §6.4 · 결정 S9) ★
 * 명세 §11이 "정책 공백"으로 남긴 중복예약·정원초과를 여기서 **모든 경로에 일괄** 적용한다.
 * 모바일·전화·수동·현장 어느 진입점이든 예약 생성은 assertCanReserve()를 반드시 통과한다.
 */

/** 예약 생성 전 불변식 검사 — 생성 경로가 늘어나도 이 함수만 거치면 정책이 지켜진다 */
async function assertCanReserve(draft: ReservationDraft, seats = 1): Promise<void> {
  const session = await sessionRepository.findById(draft.sessionId);
  if (!session) throw new NotFoundError("설명회를 찾을 수 없습니다.");
  if (session.ended || !session.active) {
    throw new InvalidStateError("종료되었거나 마감된 설명회입니다.");
  }

  // ① 중복: 재원생은 studentId, 비재원생은 전화번호 기준 (유효 예약만)
  const duplicated = await reservationRepository.existsActive({
    sessionId: draft.sessionId,
    studentId: draft.studentId,
    phone: draft.phone,
  });
  if (duplicated) throw new DuplicateReservationError();

  // ② 정원: reserved + entered 기준. 가족 예약은 인원수만큼 좌석을 확인한다.
  const active = await reservationRepository.countActive(draft.sessionId);
  if (isFull(active + seats - 1, session.capacity)) throw new CapacityExceededError();
}

export async function listReservations(sessionId: string): Promise<Reservation[]> {
  return reservationRepository.listBySession(sessionId);
}

export async function getReservation(id: string): Promise<Reservation | null> {
  return reservationRepository.findById(id);
}

export async function findReservationByCode(code: string): Promise<Reservation | null> {
  return reservationRepository.findByCode(code);
}

/** 모바일 셀프 조회 (명세 12.3) */
export async function findReservationsByPhone(phone: string): Promise<Reservation[]> {
  return reservationRepository.listByPhone(phone);
}

/** 단건 예약 — 모바일·전화·수동·현장 공용 진입점 */
export async function createReservation(draft: ReservationDraft): Promise<Reservation> {
  await assertCanReserve(draft);
  return reservationRepository.create(draft);
}

/**
 * 가족(형제) 동시 예약 (명세 12.13).
 * 자녀별로 중복을 검사하고, 정원은 인원 합계로 판정한다.
 */
export async function createFamilyReservation(drafts: ReservationDraft[]): Promise<Reservation[]> {
  if (drafts.length === 0) throw new InvalidStateError("예약할 학생을 선택하세요.");
  for (const draft of drafts) await assertCanReserve(draft, drafts.length);
  return reservationRepository.createGroup(drafts);
}

/** 수동 체크인 / QR 스캔 입장 (명세 §7.6 · §8.5) */
export async function checkIn(id: string): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (!canCheckIn(reservation.status)) throw new InvalidStateError("미체크 예약만 입장 처리할 수 있습니다.");
  return reservationRepository.updateStatus(id, "entered");
}

/** QR 코드로 입장 (명세 §8.5) */
export async function checkInByCode(code: string): Promise<Reservation> {
  const reservation = await reservationRepository.findByCode(code);
  if (!reservation) throw new NotFoundError("예약번호를 찾을 수 없습니다.");
  return checkIn(reservation.id);
}

/** 입장 취소(롤백) — 사유 필수 (명세 12.12) */
export async function rollbackEntry(id: string, reason: string): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (!canRollback(reservation.status)) throw new InvalidStateError("입장 완료 건만 취소할 수 있습니다.");
  return reservationRepository.rollbackEntry(id, reason);
}

/** 예약 취소 — staff(운영자) / parent(모바일 셀프) (명세 §5.4 · 12.3) */
export async function cancelReservation(id: string, by: CancelledBy): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (reservation.status === "cancelled") throw new InvalidStateError("이미 취소된 예약입니다.");
  return reservationRepository.cancel(id, by);
}

/**
 * 회차 이동 (명세 12.2) — 대상 세션에도 정원·중복 불변식을 적용한다.
 * 예약번호·QR은 유지되고 history만 누적된다.
 */
export async function moveReservation(id: string, toSessionId: string): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (reservation.sessionId === toSessionId) throw new InvalidStateError("같은 설명회입니다.");

  await assertCanReserve({
    sessionId: toSessionId,
    studentId: reservation.studentId,
    name: reservation.name,
    school: reservation.school,
    grade: reservation.grade,
    phone: reservation.phone,
    channel: reservation.channel,
    attendCount: reservation.attendCount,
    member: reservation.member,
  });
  return reservationRepository.move(id, toSessionId);
}

/** QR 재발급 (명세 12.12) */
export async function reissueReservationCode(id: string): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  return reservationRepository.reissueCode(id);
}

/**
 * 현장 입장 (명세 §8.6): 기존 예약이 있으면 체크인, 없으면 즉석 예약 후 체크인.
 * 즉석 예약도 불변식(정원)을 통과해야 한다 — 현장이라고 예외를 두지 않는다.
 */
export async function walkInCheckIn(studentId: string, sessionId: string): Promise<Reservation> {
  const student = await studentRepository.findById(studentId);
  if (!student) throw new NotFoundError("재원생을 찾을 수 없습니다.");

  const existing = (await reservationRepository.listBySession(sessionId)).find(
    (r) => r.studentId === studentId && (r.status === "reserved" || r.status === "entered"),
  );
  if (existing) {
    return existing.status === "entered" ? existing : checkIn(existing.id);
  }

  const created = await createReservation({
    sessionId,
    studentId: student.id,
    name: student.name,
    school: student.school,
    grade: student.grade,
    phone: student.parentPhone,
    channel: "manual",
    attendCount: 1,
    member: true,
  });
  return checkIn(created.id);
}
