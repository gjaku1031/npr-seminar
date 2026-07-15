import "server-only";
import type { SeminarRepository } from "../seminar.port";
import type { Seminar } from "@/entities/seminar";

/**
 * 인메모리 구현 — 데모 편의가 아니라 설계 검증 장치 (설계 §6.3):
 * 계약만으로 전 기능이 동작함을 상시 증명(= DB 교체 시나리오 ③의 리허설)하고,
 * DB 없이 pnpm dev 구동을 가능하게 한다. 새 도메인 추가 시 memory 구현은 필수.
 *
 * globalThis 캐시: Next dev의 모듈 재평가(HMR)에도 데이터가 유지되도록.
 */
const g = globalThis as typeof globalThis & { __seminarMemoryStore?: Map<string, Seminar> };

function seed(): Map<string, Seminar> {
  const rows: Seminar[] = [
    {
      id: "0b8f6c1e-0000-4000-8000-000000000001",
      title: "Next.js 풀스택 아키텍처 세미나",
      speaker: "김엔피",
      startsAt: new Date("2026-08-20T19:00:00+09:00"),
      status: "open",
    },
    {
      id: "0b8f6c1e-0000-4000-8000-000000000002",
      title: "DB 교체를 견디는 리포지토리 설계",
      speaker: "박아르",
      startsAt: new Date("2026-06-11T19:00:00+09:00"),
      status: "closed",
    },
  ];
  return new Map(rows.map((row) => [row.id, row]));
}

function store(): Map<string, Seminar> {
  g.__seminarMemoryStore ??= seed();
  return g.__seminarMemoryStore;
}

export const memorySeminarRepository: SeminarRepository = {
  async list() {
    return [...store().values()].sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  },

  async findById(id) {
    return store().get(id) ?? null;
  },

  async create(data) {
    const seminar: Seminar = { id: crypto.randomUUID(), ...data };
    store().set(seminar.id, seminar);
    return seminar;
  },
};
