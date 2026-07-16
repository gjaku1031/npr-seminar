import "server-only";
import {
  canCheckIn,
  canRollback,
  type Reservation,
  type ReservationDraft,
  type ReservationSource,
  type ReservedBy,
  type RosterOption,
} from "@/entities/reservation";
import { isFull } from "@/entities/session";
import type { CancelledBy } from "@/entities/reservation";
import type { Student } from "@/entities/student";
import type { Campus } from "@/shared/config/campus";
import { fmtDateTime } from "@/shared/lib/format";
import { reservationRepository, sessionRepository, smsRepository, studentRepository } from "../repositories";
import { sendSms, sendSmsBatch } from "../sms/gateway";
import { inquiryOf, renderSmsBody, reservationVars } from "../sms/template";
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
 * 중복예약·정원초과를 **모든 경로에 일괄** 적용한다: 모바일(웹앱)·명단 드랍다운·
 * 수동 추가·현장 즉석 예약 어느 진입점이든 생성은 assertCanReserve()를 반드시 통과한다.
 * (v4.0 와이어프레임은 화면 단 방지만 있다 — 기능리스트 '목업 경계'가 서버 차단을 요구)
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

  // ② 정원: reserved + entered 기준. 가족 예약은 인원 합계로 판정한다.
  const active = await reservationRepository.countActive(draft.sessionId);
  if (isFull(active + seats - 1, session.capacity)) throw new CapacityExceededError();
}

const CONFIRM_TEMPLATE_NAME = "예약 확정 + QR";
const CONFIRM_FALLBACK_BODY =
  "[npr] {학생명} 학부모님, {설명회명} 예약이 확정되었습니다.\n일시: {일시}\n장소: {장소}\n입장 QR: {QR링크}";

/**
 * 예약 확정 + QR 문자 (명세 §10.7 · qr-poc 이식) — 자녀별 QR 링크를 학부모 연락처로 발송하고
 * 발송 로그를 남긴다 (명세 §5.4). 발송 실패가 예약을 실패시키지 않는다.
 * ok 집계: 게이트웨이 비활성(로컬·키 없음)의 skip은 목업 시절과 동일하게 성공으로 취급한다.
 */
async function notifyReservationConfirmed(rows: Reservation[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    const session = await sessionRepository.findById(rows[0].sessionId);
    if (!session) return;
    const templates = await smsRepository.listTemplates();
    const body =
      templates.find((t) => t.name === CONFIRM_TEMPLATE_NAME)?.body ?? CONFIRM_FALLBACK_BODY;
    const result = await sendSmsBatch(
      rows.map((r) => ({ to: r.phone, body: renderSmsBody(body, reservationVars(r, session)) })),
    );
    await smsRepository.addLog({
      when: new Date(),
      to: rows.length,
      template: CONFIRM_TEMPLATE_NAME,
      session: session.title,
      campus: rows[0].campus || "전체",
      ok: result.sent + result.skipped,
      fail: result.failed,
      auto: false,
    });
  } catch (error) {
    console.error("[sms] 예약 확정 문자 발송 실패:", error);
  }
}

/** 입장 확인 문자 (명세 §9.2 "입장 완료 문자 발송됨" · qr-poc 이식) — 스캔·현장 입장 공통 */
async function notifyEntryConfirmed(reservation: Reservation): Promise<void> {
  if (!reservation.enteredAt) return;
  try {
    const session = await sessionRepository.findById(reservation.sessionId);
    if (!session) return;
    const body = [
      "[npr 입장 확인]",
      `${reservation.name} 학부모님, ${session.title} 입장이 확인되었습니다.`,
      `입장 시간: ${fmtDateTime(reservation.enteredAt)}`,
      `문의: ${inquiryOf(reservation.campus)}`,
    ].join("\n");
    await sendSms(reservation.phone, body);
  } catch (error) {
    console.error("[sms] 입장 확인 문자 발송 실패:", error);
  }
}

/** 재원생 → 예약 초안 — 스냅샷 필드(반명·담임·캠퍼스·단위)를 학생에서 채운다 */
function draftFromStudent(
  student: Student,
  input: {
    sessionId: string;
    channel: ReservationDraft["channel"];
    reservedBy: ReservedBy;
    source: ReservationSource;
    attendCount: number;
    phone?: string;
  },
): ReservationDraft {
  return {
    sessionId: input.sessionId,
    studentId: student.id,
    name: student.name,
    school: student.school,
    grade: student.grade,
    className: student.className,
    teacherName: student.teacherName,
    campus: student.campus,
    unit: student.unit,
    phone: input.phone ?? student.motherPhone,
    channel: input.channel,
    reservedBy: input.reservedBy,
    source: input.source,
    attendCount: input.attendCount,
    member: true,
  };
}

export async function listReservations(sessionId: string): Promise<Reservation[]> {
  return reservationRepository.listBySession(sessionId);
}

export async function listAllReservations(): Promise<Reservation[]> {
  return reservationRepository.listAll();
}

export async function getReservation(id: string): Promise<Reservation | null> {
  return reservationRepository.findById(id);
}

export async function findReservationByCode(code: string): Promise<Reservation | null> {
  return reservationRepository.findByCode(code);
}

/** 모바일 셀프 조회 — 연락처만(부분, ≥4자리) (명세 §10.8) */
export async function findReservationsByPhone(digits: string): Promise<Reservation[]> {
  return reservationRepository.listByPhoneDigits(digits);
}

/** 단건 예약 — 모든 경로의 공용 진입점. 확정 문자(QR 링크)까지 발송한다 */
export async function createReservation(draft: ReservationDraft): Promise<Reservation> {
  await assertCanReserve(draft);
  const created = await reservationRepository.create(draft);
  await notifyReservationConfirmed([created]);
  return created;
}

/**
 * 모바일 재원생 예약 — 가족(형제) 다중 선택 (명세 §10.3~10.5).
 * 학생 신원은 서버가 다시 읽고(클라이언트 입력 신뢰 금지), 모/부 매칭 번호를 phone으로 쓴다.
 * 자녀별로 중복을 검사하고, 정원은 인원 합계로 판정한다.
 */
export async function createFamilyReservation(input: {
  sessionId: string;
  studentIds: string[];
  reservedBy: ReservedBy;
  matchedBy: "모" | "부";
  attendCount: number;
}): Promise<Reservation[]> {
  if (input.studentIds.length === 0) throw new InvalidStateError("예약할 학생을 선택하세요.");

  const drafts: ReservationDraft[] = [];
  for (const studentId of input.studentIds) {
    const student = await studentRepository.findById(studentId);
    if (!student) throw new NotFoundError("재원생을 찾을 수 없습니다.");
    drafts.push(
      draftFromStudent(student, {
        sessionId: input.sessionId,
        channel: "mobile",
        reservedBy: input.reservedBy,
        source: "웹앱",
        attendCount: input.attendCount,
        phone: input.matchedBy === "부" ? student.fatherPhone : student.motherPhone,
      }),
    );
  }
  for (const draft of drafts) await assertCanReserve(draft, drafts.length);
  const created = await reservationRepository.createGroup(drafts);
  await notifyReservationConfirmed(created);
  return created;
}

/**
 * 예약 명단 드랍다운 상태 전이 (명세 §4.5) — 관리자 조작은 항상 '수동' 로그.
 * `-`(제거) / 예약 (모|부|모,부) / 수동 예약 / 예약취소 를 학생×세션 단위로 적용한다.
 */
export async function setRosterReservation(
  studentId: string,
  sessionId: string,
  option: RosterOption,
): Promise<Reservation | null> {
  const student = await studentRepository.findById(studentId);
  if (!student) throw new NotFoundError("재원생을 찾을 수 없습니다.");
  const existing = await reservationRepository.findByStudent(sessionId, studentId);

  if (option === "-") {
    if (existing) await reservationRepository.remove(existing.id);
    return null;
  }

  if (option === "예약취소") {
    if (!existing) throw new InvalidStateError("취소할 예약이 없습니다.");
    if (existing.status === "cancelled") return existing;
    return reservationRepository.cancel(existing.id, "staff");
  }

  const reservedBy: ReservedBy =
    option === "예약 (모)" ? "모" : option === "예약 (부)" ? "부" : option === "예약 (모,부)" ? "모,부" : "";

  if (existing) {
    // 취소 건은 되살리고, 유효 건은 참석 학부모 지정만 변경 (입장 상태는 유지)
    if (existing.status === "cancelled" || existing.status === "no_show") {
      return reservationRepository.reactivate(existing.id, reservedBy);
    }
    return reservationRepository.updateReservedBy(existing.id, reservedBy);
  }

  const draft = draftFromStudent(student, {
    sessionId,
    channel: "manual",
    reservedBy,
    source: "수동",
    attendCount: 1,
  });
  await assertCanReserve(draft);
  const created = await reservationRepository.create(draft);
  await notifyReservationConfirmed([created]);
  return created;
}

/** 수동 추가 — 비재원생 (명세 §4.8). 반명 '비재원생', 담임 공란, 경로는 전화/선생님/현장 예약 */
export async function addGuestReservation(input: {
  sessionId: string;
  name: string;
  school: string;
  grade: string;
  phone: string;
  campus: Campus | "";
  reservedBy: ReservedBy;
  source: Extract<ReservationSource, "전화예약" | "선생님 예약" | "현장 예약">;
  attendCount: number;
}): Promise<Reservation> {
  const draft: ReservationDraft = {
    sessionId: input.sessionId,
    studentId: null,
    name: input.name,
    school: input.school,
    grade: input.grade,
    className: "비재원생",
    teacherName: "",
    campus: input.campus,
    unit: "",
    phone: input.phone,
    channel: "manual",
    reservedBy: input.reservedBy,
    source: input.source,
    attendCount: input.attendCount,
    member: false,
  };
  await assertCanReserve(draft);
  const created = await reservationRepository.create(draft);
  await notifyReservationConfirmed([created]);
  return created;
}

/** 모바일 비재원생 예약 (명세 §10.6) — 동일 연락처 유효 예약 차단은 불변식 ①이 처리한다 */
export async function createGuestReservation(input: {
  sessionId: string;
  name: string;
  school: string;
  grade: string;
  phone: string;
  campus: Campus | "";
  reservedBy: ReservedBy;
  attendCount: number;
}): Promise<Reservation> {
  const draft: ReservationDraft = {
    sessionId: input.sessionId,
    studentId: null,
    name: input.name,
    school: input.school,
    grade: input.grade,
    className: "비재원생",
    teacherName: "",
    campus: input.campus,
    unit: "",
    phone: input.phone,
    channel: "mobile",
    reservedBy: input.reservedBy,
    source: "웹앱",
    attendCount: input.attendCount,
    member: false,
  };
  await assertCanReserve(draft);
  const created = await reservationRepository.create(draft);
  await notifyReservationConfirmed([created]);
  return created;
}

/** 수동 체크인 / QR 스캔 입장 — 스캐너 번호 기록 + 입장 확인 문자 (명세 §9.2) */
export async function checkIn(id: string, scannerNo: number): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (!canCheckIn(reservation.status)) throw new InvalidStateError("미체크 예약만 입장 처리할 수 있습니다.");
  const entered = await reservationRepository.checkIn(id, scannerNo);
  await notifyEntryConfirmed(entered);
  return entered;
}

/** QR 코드로 입장 (명세 §9.2) */
export async function checkInByCode(code: string, scannerNo: number): Promise<Reservation> {
  const reservation = await reservationRepository.findByCode(code);
  if (!reservation) throw new NotFoundError("예약번호를 찾을 수 없습니다.");
  return checkIn(reservation.id, scannerNo);
}

/** QR 스캔 결과 — 중복 스캔은 오류가 아니라 안내 (API 명세 §2.4 already_checked_in) */
export interface QrScanOutcome {
  reservation: Reservation;
  alreadyEntered: boolean;
}

/** QR 패스 페이지 조회 (공개) — 토큰으로 예약·세션을 함께 읽는다 */
export async function getReservationByQrToken(token: string): Promise<Reservation | null> {
  return reservationRepository.findByQrToken(token);
}

/**
 * QR 토큰 입장 (명세 §9.2 · API 명세 §2.4) — 실카메라 스캔 경로. qr-poc verifyQRToken 이식.
 * 무효 토큰/취소/회차 불일치는 도메인 에러로, 중복 스캔은 성공 + alreadyEntered로 구분한다.
 */
export async function checkInByQrToken(
  token: string,
  sessionId: string,
  scannerNo: number,
): Promise<QrScanOutcome> {
  const reservation = await reservationRepository.findByQrToken(token);
  if (!reservation) throw new NotFoundError("유효하지 않은 QR 코드입니다.");
  if (reservation.status === "cancelled") {
    throw new InvalidStateError("취소된 예약의 QR 코드입니다.");
  }
  if (reservation.sessionId !== sessionId) {
    const other = await sessionRepository.findById(reservation.sessionId);
    throw new InvalidStateError(
      `선택한 설명회의 QR이 아닙니다.${other ? ` 이 QR은 '${other.title}' 예약입니다.` : ""}`,
    );
  }
  if (reservation.status === "entered") return { reservation, alreadyEntered: true };

  const entered = await checkIn(reservation.id, scannerNo);
  return { reservation: entered, alreadyEntered: false };
}

/** 입장 취소(롤백) — 사유 필수 */
export async function rollbackEntry(id: string, reason: string): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (!canRollback(reservation.status)) throw new InvalidStateError("입장 완료 건만 취소할 수 있습니다.");
  return reservationRepository.rollbackEntry(id, reason);
}

/** 예약 취소 — staff(관리자) / parent(모바일 셀프) (명세 §11) */
export async function cancelReservation(id: string, by: CancelledBy): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (reservation.status === "cancelled") throw new InvalidStateError("이미 취소된 예약입니다.");
  return reservationRepository.cancel(id, by);
}

/**
 * 회차 이동 (명세 §10.8) — 대상 세션에도 정원·중복 불변식을 적용한다.
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
    className: reservation.className,
    teacherName: reservation.teacherName,
    campus: reservation.campus,
    unit: reservation.unit,
    phone: reservation.phone,
    channel: reservation.channel,
    reservedBy: reservation.reservedBy,
    source: reservation.source,
    attendCount: reservation.attendCount,
    member: reservation.member,
  });
  return reservationRepository.move(id, toSessionId);
}

/** QR 재발급 */
export async function reissueReservationCode(id: string): Promise<Reservation> {
  const reservation = await reservationRepository.findById(id);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  return reservationRepository.reissueCode(id);
}

/**
 * 현장 입장 (명세 §9.3): 기존 예약이 있으면 체크인, 없으면 즉석 예약(수동·현장 예약) 후 체크인.
 * 즉석 예약도 불변식(정원)을 통과해야 한다 — 현장이라고 예외를 두지 않는다.
 */
export async function walkInCheckIn(
  studentId: string,
  sessionId: string,
  scannerNo: number,
): Promise<Reservation> {
  const student = await studentRepository.findById(studentId);
  if (!student) throw new NotFoundError("재원생을 찾을 수 없습니다.");

  const existing = await reservationRepository.findByStudent(sessionId, studentId);
  if (existing && (existing.status === "reserved" || existing.status === "entered")) {
    return existing.status === "entered" ? existing : checkIn(existing.id, scannerNo);
  }

  const draft = draftFromStudent(student, {
    sessionId,
    channel: "manual",
    reservedBy: "",
    source: "현장 예약",
    attendCount: 1,
  });
  await assertCanReserve(draft);
  const created = await reservationRepository.create(draft);
  return checkIn(created.id, scannerNo);
}
