import "server-only";
import { and, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db/client";
import { classes, students } from "../../db/schema";
import type { Student } from "@/entities/student";
import type { StudentRepository } from "../student.port";

type StudentRow = typeof students.$inferSelect;

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    school: row.school,
    grade: row.grade,
    classId: row.classId,
    parentPhone: row.parentPhone,
    noShowCount: row.noShowCount,
    convertedFrom: row.convertedFrom ?? null,
  };
}

const digits = (s: string) => s.replace(/\D/g, "");

export const drizzleStudentRepository: StudentRepository = {
  async list(query) {
    const where: SQL[] = [];

    if (query?.classId) where.push(eq(students.classId, query.classId));

    // 강사 필터 = 담당 반 학생 (명세 §4.5)
    if (query?.teacherId) {
      const rows = await getDb()
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.teacherId, query.teacherId));
      if (rows.length === 0) return [];
      where.push(inArray(students.classId, rows.map((r) => r.id)));
    }

    // 이름·학교·연락처 부분 일치 (명세 §4.2). 연락처는 하이픈을 제거해 비교한다.
    if (query?.search) {
      const q = `%${query.search.trim()}%`;
      const qd = digits(query.search);
      const conditions = [ilike(students.name, q), ilike(students.school, q)];
      if (qd.length > 0) {
        conditions.push(sql`regexp_replace(${students.parentPhone}, '\\D', '', 'g') LIKE ${`%${qd}%`}`);
      }
      const matched = or(...conditions);
      if (matched) where.push(matched);
    }

    const rows = await getDb()
      .select()
      .from(students)
      .where(where.length > 0 ? and(...where) : undefined);
    return rows.map(toStudent);
  },

  async findById(id) {
    const rows = await getDb().select().from(students).where(eq(students.id, id)).limit(1);
    return rows[0] ? toStudent(rows[0]) : null;
  },

  /** 부분·뒷자리 매칭 — 모바일 조회·현장 입장(뒤 4자리) 공용 (명세 §8.6 · 10.2) */
  async listByParentPhone(phone) {
    const q = digits(phone);
    if (q.length === 0) return [];
    const rows = await getDb()
      .select()
      .from(students)
      .where(sql`regexp_replace(${students.parentPhone}, '\\D', '', 'g') LIKE ${`%${q}%`}`);
    return rows.map(toStudent);
  },

  async create(draft) {
    const rows = await getDb().insert(students).values(draft).returning();
    return toStudent(rows[0]);
  },

  /** 엑셀 업로드 — 이름+연락처가 같으면 병합 (명세 §4.10) */
  async upsertMany(drafts) {
    let created = 0;
    let merged = 0;
    for (const draft of drafts) {
      const existing = await getDb()
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.name, draft.name),
            sql`regexp_replace(${students.parentPhone}, '\\D', '', 'g') = ${digits(draft.parentPhone)}`,
          ),
        )
        .limit(1);

      if (existing[0]) {
        await getDb().update(students).set(draft).where(eq(students.id, existing[0].id));
        merged += 1;
      } else {
        await getDb().insert(students).values(draft);
        created += 1;
      }
    }
    return { created, merged };
  },

  /** 비재원 → 재원 전환 (명세 12.14) */
  async convertGuest(draft, from) {
    const rows = await getDb()
      .insert(students)
      .values({ ...draft, convertedFrom: from })
      .returning();
    return toStudent(rows[0]);
  },
};
