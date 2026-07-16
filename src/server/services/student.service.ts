import "server-only";
import type { Student, StudentDraft } from "@/entities/student";
import { classRepository, reservationRepository, studentRepository } from "../repositories";
import type { StudentQuery } from "../repositories";
import { InvalidStateError, NotFoundError } from "./errors";

/** 재원생 유스케이스 (명세 §4 · 12.14). */

export async function listStudents(query?: StudentQuery): Promise<Student[]> {
  return studentRepository.list(query);
}

export async function getStudent(id: string): Promise<Student | null> {
  return studentRepository.findById(id);
}

/** 학부모 연락처 조회 — 모바일 예약(전체)·현장 입장(뒤 4자리) (명세 §8.6 · 10.2) */
export async function findStudentsByParentPhone(phone: string): Promise<Student[]> {
  return studentRepository.listByParentPhone(phone);
}

export async function addStudent(draft: StudentDraft): Promise<Student> {
  if (draft.classId) {
    const cls = await classRepository.findById(draft.classId);
    if (!cls) throw new NotFoundError("반을 찾을 수 없습니다.");
  }
  return studentRepository.create(draft);
}

/** 엑셀 업로드 — 연락처 중복은 병합 (명세 §4.10) */
export async function importStudents(drafts: StudentDraft[]): Promise<{ created: number; merged: number }> {
  if (drafts.length === 0) throw new InvalidStateError("가져올 학생이 없습니다.");
  return studentRepository.upsertMany(drafts);
}

/**
 * 비재원생 → 재원생 전환 (명세 12.14).
 * 학생을 만들고 전환 출처를 남긴 뒤, 원 예약을 새 학생에 연결한다.
 */
export async function convertGuest(reservationId: string, classId: string | null): Promise<Student> {
  const reservation = await reservationRepository.findById(reservationId);
  if (!reservation) throw new NotFoundError("예약을 찾을 수 없습니다.");
  if (reservation.member || reservation.studentId) {
    throw new InvalidStateError("이미 재원생인 예약입니다.");
  }
  if (classId) {
    const cls = await classRepository.findById(classId);
    if (!cls) throw new NotFoundError("반을 찾을 수 없습니다.");
  }

  const student = await studentRepository.convertGuest(
    {
      name: reservation.name,
      school: reservation.school,
      grade: reservation.grade,
      classId,
      parentPhone: reservation.phone,
    },
    { sessionId: reservation.sessionId, resId: reservation.id, when: new Date() },
  );
  await reservationRepository.linkStudent(reservation.id, student.id);
  return student;
}
