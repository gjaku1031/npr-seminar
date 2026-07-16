import "server-only";
import type {
  CancelledBy,
  Reservation,
  ReservationDraft,
  ReservationStatus,
} from "@/entities/reservation";

/** 중복 예약 판정 키 — 재원생은 studentId, 비재원생은 전화번호 기준 (설계 §6.4 서버 불변식) */
export interface DuplicateKey {
  sessionId: string;
  studentId: string | null;
  phone: string;
}

/**
 * ★ DB 교체 격리지점 (설계 §6) ★ — 예약 계약. 시스템의 중심.
 * 모바일·전화·수동·현장 네 경로가 모두 이 계약을 통과하므로, 서버 불변식(중복·정원)이
 * 여기 위(서비스)에서 일괄 적용된다.
 */
export interface ReservationRepository {
  listBySession(sessionId: string): Promise<Reservation[]>;
  findById(id: string): Promise<Reservation | null>;
  /** 예약번호 조회 — QR 스캔·모바일 예약 조회 (명세 12.3) */
  findByCode(code: string): Promise<Reservation | null>;
  /** 연락처로 조회 — 모바일 셀프 관리 (명세 12.3) */
  listByPhone(phone: string): Promise<Reservation[]>;
  /** 가족 묶음 조회 (명세 12.13) */
  listByGroup(groupId: string): Promise<Reservation[]>;

  /** 중복 예약 존재 여부 — 유효(reserved·entered) 건만 (설계 §6.4) */
  existsActive(key: DuplicateKey): Promise<boolean>;
  /** 유효 예약 수 — 정원 판정 기준 (설계 §6.4) */
  countActive(sessionId: string): Promise<number>;

  /**
   * 단건 생성. 예약번호는 구현이 세션 회차 기준으로 채번한다 (명세 §2 code 패턴).
   * ⚠️ 정원·중복 검사는 서비스가 선행하지만, 동시성 하에서는 최종 방어가 필요하다 —
   *    구현은 code 유니크 제약과 함께 원자적으로 처리해야 한다 (설계 §6.4).
   */
  create(draft: ReservationDraft): Promise<Reservation>;
  /** 가족(형제) 동시 생성 — 같은 groupId로 원자 처리 (명세 12.13) */
  createGroup(drafts: ReservationDraft[]): Promise<Reservation[]>;

  /** 체크인/노쇼 등 상태 전이 (명세 §7.6) */
  updateStatus(id: string, status: ReservationStatus): Promise<Reservation>;
  /** 취소 — 주체 기록 (명세 12.3) */
  cancel(id: string, by: CancelledBy): Promise<Reservation>;
  /** 회차 이동 — 예약번호·QR 유지, history 누적 (명세 12.2) */
  move(id: string, toSessionId: string): Promise<Reservation>;
  /** QR 재발급 — 이전 코드는 codeHistory로 (명세 12.12) */
  reissueCode(id: string): Promise<Reservation>;
  /** 입장 취소(롤백) — reserved 복귀 + 사유를 audit에 (명세 12.12) */
  rollbackEntry(id: string, reason: string): Promise<Reservation>;
  /** 비재원 예약을 전환된 학생에 연결 (명세 12.14) */
  linkStudent(id: string, studentId: string): Promise<Reservation>;
}
