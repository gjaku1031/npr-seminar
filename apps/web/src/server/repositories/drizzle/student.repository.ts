import "server-only";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "../../db/client";
import { students } from "../../db/schema";
import { unitMatchesTab } from "@/entities/class";
import type { Student } from "@/entities/student";
import type { StudentRepository } from "../student.port";

type StudentRow = typeof students.$inferSelect;

function toStudent(row: StudentRow): Student {
  return {
    id: row.id,
    no: row.no,
    name: row.name,
    school: row.school,
    grade: row.grade,
    classId: row.classId,
    className: row.className,
    teacherName: row.teacherName,
    campus: row.campus,
    unit: row.unit,
    motherPhone: row.motherPhone,
    fatherPhone: row.fatherPhone,
  };
}

const digits = (s: string) => s.replace(/\D/g, "");

/** 숫자만 남긴 연락처 비교식 (모/부) */
const phoneDigitsLike = (column: AnyPgColumn, q: string) =>
  sql`regexp_replace(${column}, '\\D', '', 'g') LIKE ${`%${q}%`}`;

export const drizzleStudentRepository: StudentRepository = {
  async list(query) {
    const where: SQL[] = [];

    if (query?.campus && query.campus !== "전체") {
      where.push(sql`${students.campus} = ${query.campus}`);
    }
    if (query?.teacherName) where.push(eq(students.teacherName, query.teacherName));

    // 이름·학교·연락처(모/부) 부분 일치 (명세 §4.2)
    if (query?.search) {
      const q = `%${query.search.trim()}%`;
      const qd = digits(query.search);
      const conditions = [ilike(students.name, q), ilike(students.school, q)];
      if (qd.length > 0) {
        conditions.push(phoneDigitsLike(students.motherPhone, qd));
        conditions.push(phoneDigitsLike(students.fatherPhone, qd));
      }
      const matched = or(...conditions);
      if (matched) where.push(matched);
    }

    const rows = await getDb()
      .select()
      .from(students)
      .where(where.length > 0 ? and(...where) : undefined);

    // 단위 탭 매칭(특목=예중1·예고1 포함)은 도메인 규칙이라 SQL로 옮기지 않는다 (명세 §2.1)
    const list = rows.map(toStudent);
    if (query?.unitTab && query.unitTab !== "전체") {
      return list.filter((s) => unitMatchesTab(s.unit, query.unitTab!));
    }
    return list;
  },

  async findById(id) {
    const rows = await getDb().select().from(students).where(eq(students.id, id)).limit(1);
    return rows[0] ? toStudent(rows[0]) : null;
  },

  /** 부분·뒷자리 매칭 — **모/부 모두** (명세 §9.3 · §10.3). 4자리 미만은 미매칭 */
  async listByParentPhone(phone) {
    const q = digits(phone);
    if (q.length < 4) return [];
    const rows = await getDb()
      .select()
      .from(students)
      .where(or(phoneDigitsLike(students.motherPhone, q), phoneDigitsLike(students.fatherPhone, q)));
    return rows.map(toStudent);
  },
};
