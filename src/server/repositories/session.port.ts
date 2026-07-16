import "server-only";
import type { Session, SessionDraft, SessionStats } from "@/entities/session";

/**
 * ★ DB 교체 격리지점 (설계 §6) ★ — 설명회 계약.
 * 도메인 모델 타입으로만 정의한다. Row·SQL·드라이버 타입이 등장하면 격리가 깨진 것이다.
 *
 * v4.0: 리마인드(toggleReminder) 폐기 → 설문 문자(updateSurveySms)로 대체 (명세 §6.4).
 */
export interface SessionRepository {
  list(): Promise<Session[]>;
  /** 모바일 예약 화면에 노출되는 설명회 (명세 §10.1) */
  listActive(): Promise<Session[]>;
  findById(id: string): Promise<Session | null>;
  create(draft: SessionDraft): Promise<Session>;
  update(id: string, patch: Partial<SessionDraft>): Promise<Session>;
  /** 만족도 설문 문자 본문 저장 (명세 §6.4) */
  updateSurveySms(id: string, surveySms: string): Promise<Session>;

  /** 세션별 상태 집계 — 현황 카드·정원 판정의 기준 (명세 §6.3) */
  stats(sessionId: string): Promise<SessionStats>;

  /**
   * 종료 처리: ended=true + 미체크(reserved) 일괄 no_show — 내부 집계용, 명단 미표기 (명세 §6.6).
   * 다중 테이블 원자 변경이므로 **한 메서드**로 둔다 — 트랜잭션 차이가 구현 내부에 숨는다 (설계 §8).
   * @returns 노쇼 처리된 건수
   */
  endSession(id: string): Promise<number>;

  /**
   * 삭제: 세션 + 연동 예약 함께 제거 (명세 §6.7).
   * 위와 같은 이유로 단일 메서드. @returns 함께 삭제된 예약 건수
   */
  deleteWithReservations(id: string): Promise<number>;
}
