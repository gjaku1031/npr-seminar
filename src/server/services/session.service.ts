import "server-only";
import type { Session, SessionDraft, SessionStats } from "@/entities/session";
import { sessionRepository } from "../repositories";
import { InvalidStateError, NotFoundError } from "./errors";

/** 설명회 유스케이스 (명세 §7). 리포지토리 계약만 안다. */

export async function listSessions(): Promise<Session[]> {
  return sessionRepository.list();
}

/** 모바일 예약 화면에 노출될 설명회 (명세 10.1) */
export async function listOpenSessions(): Promise<Session[]> {
  return sessionRepository.listActive();
}

export async function getSession(id: string): Promise<Session | null> {
  return sessionRepository.findById(id);
}

export async function getSessionStats(id: string): Promise<SessionStats> {
  return sessionRepository.stats(id);
}

/** 설명회 목록 + 각 현황 — 목록 카드의 예약률 게이지용 (명세 §7.1) */
export async function listSessionsWithStats(): Promise<Array<{ session: Session; stats: SessionStats }>> {
  const sessions = await sessionRepository.list();
  return Promise.all(
    sessions.map(async (session) => ({ session, stats: await sessionRepository.stats(session.id) })),
  );
}

export async function createSession(draft: SessionDraft): Promise<Session> {
  if (draft.capacity <= 0) throw new InvalidStateError("정원은 1명 이상이어야 합니다.");
  return sessionRepository.create(draft);
}

/** 리마인드 토글 (명세 12.5) */
export async function toggleReminder(
  sessionId: string,
  reminderId: string,
  enabled: boolean,
): Promise<Session> {
  return sessionRepository.toggleReminder(sessionId, reminderId, enabled);
}

/**
 * 설명회 종료 (명세 12.4) — 미체크를 일괄 노쇼 태깅하고 학생 노쇼 회수를 누적한다.
 * 다중 테이블 원자 변경은 리포지토리의 단일 메서드가 책임진다 (설계 §8).
 * @returns 노쇼 처리된 건수
 */
export async function endSession(id: string): Promise<number> {
  const session = await sessionRepository.findById(id);
  if (!session) throw new NotFoundError("설명회를 찾을 수 없습니다.");
  if (session.ended) throw new InvalidStateError("이미 종료된 설명회입니다.");
  return sessionRepository.endSession(id);
}

/**
 * 설명회 삭제 (명세 §7.7) — 연동 예약도 함께 제거된다.
 * @returns 함께 삭제된 예약 건수 (UI가 "취소 문자 발송" 안내에 사용)
 */
export async function deleteSession(id: string): Promise<number> {
  const session = await sessionRepository.findById(id);
  if (!session) throw new NotFoundError("설명회를 찾을 수 없습니다.");
  return sessionRepository.deleteWithReservations(id);
}
