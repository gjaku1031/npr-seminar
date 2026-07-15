import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { seminars } from "../../db/schema";
import type { SeminarRepository } from "../seminar.port";
import type { Seminar } from "@/entities/seminar";

type SeminarRow = typeof seminars.$inferSelect;

/**
 * Row→도메인 변환 — 참고 구조 DTO→VM 규율의 서버측 대응 (설계 §1 대응표).
 * 스키마가 바뀌면 "여기서" 컴파일 에러가 난다(의도된 조기 감지). 상위 레이어는 모른다.
 */
function toSeminar(row: SeminarRow): Seminar {
  return {
    id: row.id,
    title: row.title,
    speaker: row.speaker,
    startsAt: row.startsAt,
    status: row.status,
  };
}

export const drizzleSeminarRepository: SeminarRepository = {
  async list() {
    const rows = await getDb().select().from(seminars).orderBy(desc(seminars.startsAt));
    return rows.map(toSeminar);
  },

  async findById(id) {
    const rows = await getDb().select().from(seminars).where(eq(seminars.id, id)).limit(1);
    return rows[0] ? toSeminar(rows[0]) : null;
  },

  async create(data) {
    const rows = await getDb()
      .insert(seminars)
      .values({
        title: data.title,
        speaker: data.speaker,
        startsAt: data.startsAt,
        status: data.status,
      })
      .returning();
    return toSeminar(rows[0]);
  },
};
