import "server-only";
import type {
  CancelledBy,
  Reservation,
  ReservationDraft,
} from "@/entities/reservation";

/** 중복 예약 판정 키 — 재원생은 studentId, 비재원생은 전화번호 기준 (설계 §6.4 서버 불변식) */
export interface DuplicateKey {
  sessionId: string;
  studentId: string | null;
  phone: string;
}

/**
 * ★ DB 교체 격리지점 (설계 §6) ★ — 예약 계약. 시스템의 중심.
 * 모바일·콘솔 드랍다운·수동 추가·현장 경로가 모두 이 계약을 통과하므로,
 * 서버 불변식(중복·정원)이 여기 위(서비스)에서 일괄 적용된다.
 *
 * v4.0: checkIn에 스캐너 번호 기록, 생성·취소에 행위자 기준 로그 적재,
 * 예약 명단 드랍다운의 참석 학부모 지정(updateReservedBy)·`-` 제거(remove) 추가 (명세 §4.5).
 */
export interface ReservationRepository {
  listBySession(sessionId: string): Promise<Reservation[]>;
  /** 전 세션 목록 — 통계·허브 요약 (명세 §3 · §8) */
  listAll(): Promise<Reservation[]>;
  findById(id: string): Promise<Reservation | null>;
  /** 예약번호 조회 — QR 스캔 (명세 §9.2) */
  findByCode(code: string): Promise<Reservation | null>;
  /** 연락처 부분 매칭 조회 — 모바일 셀프 관리(연락처만, ≥4자리) (명세 §10.8) */
  listByPhoneDigits(digits: string): Promise<Reservation[]>;
  /** 가족 묶음 조회 (명세 §10.5) */
  listByGroup(groupId: string): Promise<Reservation[]>;
  /** 학생의 해당 세션 예약 (유효·취소 무관 최신) — 명단 드랍다운 상태 산출 (명세 §4.5) */
  findByStudent(sessionId: string, studentId: string): Promise<Reservation | null>;

  /** 중복 예약 존재 여부 — 유효(reserved·entered) 건만 (설계 §6.4) */
  existsActive(key: DuplicateKey): Promise<boolean>;
  /** 유효 예약 수 — 정원 판정 기준 (설계 §6.4) */
  countActive(sessionId: string): Promise<number>;

  /**
   * 단건 생성. 예약번호는 구현이 세션 회차 기준으로 채번하고,
   * 생성 로그(행위자 기준 라벨)를 함께 적재한다 (명세 §11).
   * ⚠️ 정원·중복 검사는 서비스가 선행하지만, 동시성 하에서는 최종 방어가 필요하다 —
   *    구현은 code 유니크 제약과 함께 원자적으로 처리해야 한다 (설계 §6.4).
   */
  create(draft: ReservationDraft): Promise<Reservation>;
  /** 가족(형제) 동시 생성 — 같은 groupId로 원자 처리 (명세 §10.5) */
  createGroup(drafts: ReservationDraft[]): Promise<Reservation[]>;

  /** 입장 처리 — 스캐너 번호·입장 시각 기록 (명세 §4.6 · §9.2) */
  checkIn(id: string, scannerNo: number): Promise<Reservation>;
  /** 취소 — 주체 기록 + 행위자 기준 로그 (명세 §11) */
  cancel(id: string, by: CancelledBy): Promise<Reservation>;
  /** 재예약(취소 건 되살림) — 명단 드랍다운 상태 전이 + 수동 예약 로그 (명세 §4.5) */
  reactivate(id: string, reservedBy: Reservation["reservedBy"]): Promise<Reservation>;
  /** 참석 학부모 지정 변경 — 명단 드랍다운 예약(모/부/모,부) (명세 §4.5) */
  updateReservedBy(id: string, reservedBy: Reservation["reservedBy"]): Promise<Reservation>;
  /** 예약 제거 — 명단 드랍다운 `-` (명세 §4.5) */
  remove(id: string): Promise<void>;
  /** 회차 이동 — 예약번호·QR 유지, history 누적 (명세 §10.8) */
  move(id: string, toSessionId: string): Promise<Reservation>;
  /** QR 재발급 — 이전 코드는 codeHistory로 */
  reissueCode(id: string): Promise<Reservation>;
  /** 입장 취소(롤백) — reserved 복귀 + 사유를 audit에 */
  rollbackEntry(id: string, reason: string): Promise<Reservation>;
}
