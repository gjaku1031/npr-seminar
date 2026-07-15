import "server-only";
import { seminarRepository } from "../repositories";
import type { Seminar, SeminarDraft } from "@/entities/seminar";

/**
 * 유스케이스 계층 — 리포지토리 "계약"만 안다. drizzle·neon이 여기 등장하면
 * 규율 위반이고 ESLint(R2)가 잡는다. 도메인 규칙(기본 상태, 권한, 트랜잭션 경계)의 자리.
 */
export async function listSeminars(): Promise<Seminar[]> {
  return seminarRepository.list();
}

export async function getSeminar(id: string): Promise<Seminar | null> {
  return seminarRepository.findById(id);
}

/** 도메인 규칙: 신규 세미나는 "open" 상태로 생성한다. */
export async function createSeminar(draft: SeminarDraft): Promise<Seminar> {
  return seminarRepository.create({ ...draft, status: "open" });
}
