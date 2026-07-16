import "server-only";
import type { ConvertedFrom, Student, StudentDraft } from "@/entities/student";

/** 명단 조회 조건 (명세 §4.2~§4.7) — 필터 조합은 구현이 질의로 번역한다 */
export interface StudentQuery {
  /** 이름·학교·연락처 부분 일치 (명세 §4.2) */
  search?: string;
  /** 반 필터 (명세 §4.4) */
  classId?: string;
  /** 강사 필터 = 담당 반 학생 (명세 §4.5, flows GANGSA-F5) */
  teacherId?: string;
}

export interface StudentRepository {
  list(query?: StudentQuery): Promise<Student[]>;
  findById(id: string): Promise<Student | null>;
  /** 학부모 연락처(부분·뒷자리)로 조회 — 모바일 예약·현장 입장 (명세 §8.6 · 10.2) */
  listByParentPhone(phone: string): Promise<Student[]>;
  create(draft: StudentDraft): Promise<Student>;
  /** 엑셀 업로드 — 연락처 중복은 병합 (명세 §4.10 · flows OWNER-F2) */
  upsertMany(drafts: StudentDraft[]): Promise<{ created: number; merged: number }>;
  /** 비재원 → 재원 전환: 학생 생성 + 출처 기록 (명세 12.14) */
  convertGuest(draft: StudentDraft, from: ConvertedFrom): Promise<Student>;
}
