import "server-only";
import type { Student } from "@/entities/student";
import { studentRepository } from "../repositories";
import type { StudentQuery } from "../repositories";

/**
 * 재원생 유스케이스 (명세 v4.0 §4) — 읽기 전용 참조 데이터.
 * v2.0의 추가·엑셀 업로드·비재원 전환은 폐기됐다 (실데이터 연동은 명세 §12).
 */

export async function listStudents(query?: StudentQuery): Promise<Student[]> {
  return studentRepository.list(query);
}

export async function getStudent(id: string): Promise<Student | null> {
  return studentRepository.findById(id);
}

/** 학부모 연락처 조회 — 모바일 예약(부분)·현장 입장(뒤 4자리), **모/부 모두 매칭** (명세 §9.3 · §10.3) */
export async function findStudentsByParentPhone(digits: string): Promise<Student[]> {
  return studentRepository.listByParentPhone(digits);
}
