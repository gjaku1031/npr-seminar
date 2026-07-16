/**
 * 예약(Reservation) 도메인 모델 — 명세 §1.2 · §2 · §5.
 * 시스템의 중심 애그리거트: 모바일·전화·수동·현장 네 경로가 모두 이 모델로 수렴한다.
 */

/** 공통 상태 어휘 (명세 §1.2) */
export type ReservationStatus = "reserved" | "entered" | "no_show" | "cancelled";

/** 접수 채널 (명세 §1.2) */
export type ReservationChannel = "mobile" | "phone" | "manual";

/** 취소 주체 — 운영자 취소와 학부모 셀프 취소 구분 (명세 12.3) */
export type CancelledBy = "staff" | "parent";

/** 회차 이동 이력 (명세 12.2) — 예약번호·QR은 유지되고 sessionId만 바뀐다 */
export interface ReservationHistory {
  from: string;
  to: string;
  when: Date;
}

/** 감사 기록 — 입장 취소(롤백) 등 되돌림 조작의 사유 추적 (명세 12.12) */
export interface ReservationAudit {
  action: string;
  reason: string;
  when: Date;
}

export interface Reservation {
  id: string;
  /** 예약번호 `NPR-SSx-0000`. 재발급 시 `-Rn` 접미 (명세 12.12) */
  code: string;
  sessionId: string;
  /** 재원생 예약이면 학생 id, 비재원생이면 null (명세 §2) */
  studentId: string | null;
  name: string;
  school: string;
  grade: string;
  phone: string;
  channel: ReservationChannel;
  status: ReservationStatus;
  /** 참석 인원 1~4 — 세션의 attendField=true일 때만 의미 있음 */
  attendCount: number;
  /** 재원생 여부 (명세 §2 member) */
  member: boolean;
  /** 예약 접수 시각 (명세 §2 원본 필드명 `time` — 서버 모델에서는 의미를 드러내 개명) */
  reservedAt: Date;
  history: ReservationHistory[];
  /** 재발급 이전 코드 누적 (명세 12.12) */
  codeHistory: string[];
  audit: ReservationAudit[];
  /** 가족(형제) 동시 예약 묶음 — 같은 groupId끼리 한 번에 생성 (명세 12.13) */
  groupId: string | null;
  cancelledBy: CancelledBy | null;
}

/**
 * 예약 생성 입력 — code·status·history 등 서버가 정하는 값은 제외.
 * 네 경로(모바일·전화·수동·현장) 모두 이 입력으로 수렴하며, 서버 불변식(중복·정원)이 일괄 적용된다.
 */
export interface ReservationDraft {
  sessionId: string;
  studentId: string | null;
  name: string;
  school: string;
  grade: string;
  phone: string;
  channel: ReservationChannel;
  attendCount: number;
  member: boolean;
}

/** 목록 필터 (명세 §5.3 · §7.5) */
export type ReservationFilter = "all" | "reserved" | "entered" | "no_show" | "cancelled" | "phone";

/** 문자 수신 대상 그룹 (명세 §6.4) */
export type SmsTargetGroup = "all" | "reserved" | "entered" | "cancelled";

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  reserved: "미체크",
  entered: "입장 완료",
  no_show: "노쇼",
  cancelled: "취소됨",
};

export const reservationChannelLabel: Record<ReservationChannel, string> = {
  mobile: "모바일",
  phone: "전화",
  manual: "수동",
};

/** 정원·중복 판정에 포함되는 "유효 예약" — 취소·노쇼는 좌석을 점유하지 않는다 */
export function isActiveReservation(status: ReservationStatus): boolean {
  return status === "reserved" || status === "entered";
}

/** 체크인 가능 여부 — 미체크 예약만 입장 처리 (명세 §7.6) */
export function canCheckIn(status: ReservationStatus): boolean {
  return status === "reserved";
}

/** 입장 취소(롤백) 가능 여부 — 입장 완료 건만 (명세 12.12) */
export function canRollback(status: ReservationStatus): boolean {
  return status === "entered";
}

/** 예약번호 생성 규칙 `NPR-SS{round}-{seq4}` (명세 §2 code 패턴) */
export function formatReservationCode(round: number, seq: number): string {
  return `NPR-SS${round}-${String(seq).padStart(4, "0")}`;
}

/** 재발급 코드 `-Rn` (명세 12.12) */
export function reissuedCode(code: string, reissueCount: number): string {
  const base = code.replace(/-R\d+$/, "");
  return `${base}-R${reissueCount}`;
}
