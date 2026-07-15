import "server-only";
import { resolveRepoImpl } from "../config/env";
import { drizzleSeminarRepository } from "./drizzle/seminar.repository";
import { memorySeminarRepository } from "./memory/seminar.repository";
import type { SeminarRepository } from "./seminar.port";

/**
 * ★ 조립(교체) 지점 (설계 §6.1-③) ★
 * 구현 선택은 이 파일이 전담한다 — 다른 어디서도 구현을 직접 import하지 않는다(ESLint R3).
 * DB 교체 시: 새 구현 폴더 추가 → 아래 스위치 한 곳만 변경. 상위 레이어는 모른다.
 *
 * (drizzle 구현은 지연 초기화라 memory 선택 시 DATABASE_URL이 없어도 안전하다.)
 */
const impl = resolveRepoImpl();

export const seminarRepository: SeminarRepository =
  impl === "memory" ? memorySeminarRepository : drizzleSeminarRepository;

export type { SeminarRepository } from "./seminar.port";
