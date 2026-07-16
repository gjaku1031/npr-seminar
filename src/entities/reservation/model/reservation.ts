/**
 * 예약(Reservation) 도메인 모델 — 명세 v4.0 §2 · §11.
 * 시스템의 중심 애그리거트: 모바일(웹앱)·수동(콘솔 드랍다운·수동 추가·현장) 경로가 모두 수렴한다.
 *
 * v4.0 개편:
 * - channel 2종(mobile|manual) — 전화예약 모듈 폐기, 경로 구분은 source가 담당 (명세 §8.3)
 * - reservedBy(참석 학부모 모/부/모,부) · source(웹앱|수동|전화예약|선생님 예약|현장 예약) 추가
 * - scannerNo·enteredAt(입장 열 2줄 표기) · logs[](행위자 기준 이력) 추가 (명세 §4.6~4.7)
 * - className·teacherName·campus·unit 스냅샷 — 11열 테이블·설문·통계가 직접 사용 (명세 §2)
 */

import type { Campus } from "@/shared/config/campus";

/** 공통 상태 어휘 (명세 §11) */
export type ReservationStatus = "reserved" | "entered" | "no_show" | "cancelled";

/** 접수 채널 — 통계 도넛의 2종 (명세 §8.3) */
export type ReservationChannel = "mobile" | "manual";

/** 참석 학부모 (명세 §4.5 · §10.4). 빈 문자열 = 미지정(참석 인원 미수집 수동 경로 등) */
export type ReservedBy = "모" | "부" | "모,부" | "";

/** 예약 경로 (명세 §2 source) — 관리자 수동 추가 시 전화/선생님/현장 예약 중 선택 (명세 §4.8) */
export type ReservationSource = "웹앱" | "수동" | "전화예약" | "선생님 예약" | "현장 예약";

/** 취소 주체 — 관리자 취소와 학부모 셀프 취소 구분 (명세 §11) */
export type CancelledBy = "staff" | "parent";

/** 이력 로그 한 줄 — 라벨은 행위자 기준 (명세 §11: 웹앱/수동 예약·취소) */
export interface ReservationLog {
  label: string;
  at: Date;
}

/** 회차 이동 이력 (명세 §10.8) — 예약번호·QR은 유지되고 sessionId만 바뀐다 */
export interface ReservationHistory {
  from: string;
  to: string;
  when: Date;
}

/** 감사 기록 — 입장 취소(롤백) 등 되돌림 조작의 사유 추적 */
export interface ReservationAudit {
  action: string;
  reason: string;
  when: Date;
}

export interface Reservation {
  id: string;
  /** 예약번호 `NPR-SSx-0000`. 재발급 시 `-Rn` 접미 */
  code: string;
  /**
   * 입장 QR 토큰 — QR에는 예약번호(추측 가능) 대신 서버 발급 난수 토큰을 넣는다 (API 명세 §0-5).
   * QR 링크 `/q/{qrToken}`의 키이며, 재발급 시 코드와 함께 회전된다.
   */
  qrToken: string;
  sessionId: string;
  /** 재원생 예약이면 학생 id, 비재원생이면 null (명세 §2) */
  studentId: string | null;
  name: string;
  school: string;
  grade: string;
  /** 반명 스냅샷 — 비재원생은 "비재원생" (명세 §4.8) */
  className: string;
  /** 담임명 스냅샷 — 비재원생은 공란 */
  teacherName: string;
  campus: Campus | "";
  /** 단위 스냅샷 — 비재원생은 공란 (명세 §2.1) */
  unit: string;
  phone: string;
  channel: ReservationChannel;
  status: ReservationStatus;
  reservedBy: ReservedBy;
  source: ReservationSource;
  /** 참석 인원 — 세션의 attendField=true일 때만 의미 있음 */
  attendCount: number;
  /** 재원생 여부 (명세 §2 member) */
  member: boolean;
  /** 예약 접수 시각 (명세 §2 원본 필드명 `time` — 서버 모델에서는 의미를 드러내 개명) */
  reservedAt: Date;
  /** 입장 처리한 스캐너 번호 — 입장 열 `#N ↵ 시각` (명세 §4.6) */
  scannerNo: number | null;
  enteredAt: Date | null;
  /** 행위자 기준 이력 — 로그 열 2줄 + 툴팁 (명세 §4.7) */
  logs: ReservationLog[];
  history: ReservationHistory[];
  /** 재발급 이전 코드 누적 */
  codeHistory: string[];
  audit: ReservationAudit[];
  /** 가족(형제) 동시 예약 묶음 — 같은 groupId끼리 한 번에 생성 (명세 §10.5) */
  groupId: string | null;
  cancelledBy: CancelledBy | null;
}

/**
 * 예약 생성 입력 — code·status·logs 등 서버가 정하는 값은 제외.
 * 모든 경로(모바일·콘솔 드랍다운·수동 추가·현장)가 이 입력으로 수렴하며,
 * 서버 불변식(중복·정원)이 일괄 적용된다 (설계 §6.4).
 */
export interface ReservationDraft {
  sessionId: string;
  studentId: string | null;
  name: string;
  school: string;
  grade: string;
  className: string;
  teacherName: string;
  campus: Campus | "";
  unit: string;
  phone: string;
  channel: ReservationChannel;
  reservedBy: ReservedBy;
  source: ReservationSource;
  attendCount: number;
  member: boolean;
}

/** 예약 명단 드랍다운 옵션 (명세 §4.5) */
export type RosterOption = "-" | "예약 (모)" | "예약 (부)" | "예약 (모,부)" | "수동 예약" | "예약취소";

export const ROSTER_OPTIONS: RosterOption[] = [
  "-",
  "예약 (모)",
  "예약 (부)",
  "예약 (모,부)",
  "수동 예약",
  "예약취소",
];

/** 문자 수신 대상 그룹 (명세 §5.2) — 예약자 전체/미체크만/입장 완료/취소자 */
export type SmsTargetGroup = "all" | "reserved" | "entered" | "cancelled";

export const reservationStatusLabel: Record<ReservationStatus, string> = {
  reserved: "미체크",
  entered: "입장 완료",
  no_show: "노쇼",
  cancelled: "취소됨",
};

export const reservationChannelLabel: Record<ReservationChannel, string> = {
  mobile: "모바일",
  manual: "수동",
};

/** 생성 로그 라벨 — 행위자 기준: 학부모(웹앱) / 관리자 조작(수동) (명세 §11) */
export function createdLogLabel(channel: ReservationChannel): string {
  return channel === "mobile" ? "웹앱 예약" : "수동 예약";
}

/** 취소 로그 라벨 — 행위자 기준 (명세 §11) */
export function cancelledLogLabel(by: CancelledBy): string {
  return by === "parent" ? "웹앱 예약 취소" : "수동 예약 취소";
}

/** 정원·중복 판정에 포함되는 "유효 예약" — 취소·노쇼는 좌석을 점유하지 않는다 */
export function isActiveReservation(status: ReservationStatus): boolean {
  return status === "reserved" || status === "entered";
}

/** 체크인 가능 여부 — 미체크 예약만 입장 처리 (명세 §9.2) */
export function canCheckIn(status: ReservationStatus): boolean {
  return status === "reserved";
}

/** 입장 취소(롤백) 가능 여부 — 입장 완료 건만 */
export function canRollback(status: ReservationStatus): boolean {
  return status === "entered";
}

/** 예약번호 생성 규칙 `NPR-SS{round}-{seq4}` (명세 §2 code 패턴) */
export function formatReservationCode(round: number, seq: number): string {
  return `NPR-SS${round}-${String(seq).padStart(4, "0")}`;
}

/** 재발급 코드 `-Rn` */
export function reissuedCode(code: string, reissueCount: number): string {
  const base = code.replace(/-R\d+$/, "");
  return `${base}-R${reissueCount}`;
}
