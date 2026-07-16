import "server-only";
import { matchesParentPhone } from "@/entities/student";
import { unitMatchesTab } from "@/entities/class";
import type { StudentRepository } from "../student.port";
import { clone, db } from "./store";

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * v4.0: 재원생 명단은 읽기 전용 참조 데이터 (명세 §4).
 * 검색은 이름·학교·연락처(모/부), 필터는 캠퍼스·단위 탭·담임.
 */
export const memoryStudentRepository: StudentRepository = {
  async list(query) {
    let rows = [...db().students.values()];

    if (query?.campus && query.campus !== "전체") {
      rows = rows.filter((s) => s.campus === query.campus);
    }
    if (query?.unitTab && query.unitTab !== "전체") {
      rows = rows.filter((s) => unitMatchesTab(s.unit, query.unitTab!));
    }
    if (query?.teacherName) rows = rows.filter((s) => s.teacherName === query.teacherName);
    if (query?.search) {
      const q = query.search.trim().toLowerCase();
      const qd = digits(q);
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.school.toLowerCase().includes(q) ||
          (qd.length > 0 &&
            (digits(s.motherPhone).includes(qd) || digits(s.fatherPhone).includes(qd))),
      );
    }
    return clone(rows);
  },

  async findById(id) {
    const row = db().students.get(id);
    return row ? clone(row) : null;
  },

  /** 부분·뒷자리 매칭 — **모/부 모두** (명세 §9.3 · §10.3) */
  async listByParentPhone(phone) {
    const q = digits(phone);
    return clone([...db().students.values()].filter((s) => matchesParentPhone(s, q)));
  },
};
