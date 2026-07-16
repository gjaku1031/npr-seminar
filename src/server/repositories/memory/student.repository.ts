import "server-only";
import { matchesPhoneSuffix, type Student, type StudentDraft } from "@/entities/student";
import type { StudentRepository } from "../student.port";
import { clone, db } from "./store";

function build(draft: StudentDraft): Student {
  return { id: crypto.randomUUID(), ...draft, noShowCount: 0, convertedFrom: null };
}

const digits = (s: string) => s.replace(/\D/g, "");

export const memoryStudentRepository: StudentRepository = {
  async list(query) {
    const store = db();
    let rows = [...store.students.values()];

    if (query?.teacherId) {
      const classIds = new Set(
        [...store.classes.values()].filter((c) => c.teacherId === query.teacherId).map((c) => c.id),
      );
      rows = rows.filter((s) => s.classId !== null && classIds.has(s.classId));
    }
    if (query?.classId) rows = rows.filter((s) => s.classId === query.classId);
    if (query?.search) {
      const q = query.search.trim().toLowerCase();
      const qd = digits(q);
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.school.toLowerCase().includes(q) ||
          (qd.length > 0 && digits(s.parentPhone).includes(qd)),
      );
    }
    return clone(rows);
  },

  async findById(id) {
    const row = db().students.get(id);
    return row ? clone(row) : null;
  },

  /** 부분·뒷자리 매칭 — 모바일 조회(전체)·현장 입장(뒤 4자리) 공용 (명세 §8.6 · 10.2) */
  async listByParentPhone(phone) {
    const q = digits(phone);
    if (q.length === 0) return [];
    return clone(
      [...db().students.values()].filter(
        (s) => digits(s.parentPhone).includes(q) || matchesPhoneSuffix(s.parentPhone, q),
      ),
    );
  },

  async create(draft) {
    const row = build(draft);
    db().students.set(row.id, row);
    return clone(row);
  },

  /** 엑셀 업로드 — 연락처 중복은 병합 (명세 §4.10) */
  async upsertMany(drafts) {
    const store = db();
    let created = 0;
    let merged = 0;
    for (const draft of drafts) {
      const existing = [...store.students.values()].find(
        (s) => digits(s.parentPhone) === digits(draft.parentPhone) && s.name === draft.name,
      );
      if (existing) {
        store.students.set(existing.id, { ...existing, ...draft });
        merged += 1;
      } else {
        const row = build(draft);
        store.students.set(row.id, row);
        created += 1;
      }
    }
    return { created, merged };
  },

  /** 비재원 → 재원 전환 (명세 12.14) */
  async convertGuest(draft, from) {
    const row: Student = { ...build(draft), convertedFrom: from };
    db().students.set(row.id, row);
    return clone(row);
  },
};
