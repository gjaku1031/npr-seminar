import { isRepresentativeStudentClass, isScienceStudentClass } from "./student-classification.js";
import { primaryTeacher } from "./student-display-normalizer.js";

/**
 * 담임 판정에 쓰는 수강 등록 근거
 */
export interface StudentAssignmentClassEvidence {
  /**
   * 반 이름
   */
  readonly className: string;

  /**
   * 원천에서 현재 활성인지 여부
   */
  readonly sourceActive: boolean;
}

/**
 * 현재 학생의 담임 판정 근거
 */
export interface CurrentStudentHomeroomEvidence {
  /**
   * 학생 원장 담임 값
   */
  readonly teacherName: string | null | undefined;

  /**
   * 수강 등록 목록
   */
  readonly assignments: readonly StudentAssignmentClassEvidence[];
}

/**
 * 활성 대표 수학 반(과학 반 제외) 보유 여부
 */
export function hasActiveProjectedMathAssignment(
  assignments: readonly StudentAssignmentClassEvidence[],
): boolean {
  return assignments.some((assignment) => assignment.sourceActive
    && isRepresentativeStudentClass(assignment.className)
    && !isScienceStudentClass(assignment.className));
}

/**
 * 현재 학생의 수학 담임
 *
 * @returns 활성 대표 수학 반이 있을 때만 원장 담임의 첫 번째 이름, 아니면 null
 */
export function currentStudentMathHomeroomTeacher(
  student: CurrentStudentHomeroomEvidence,
): string | null {
  return hasActiveProjectedMathAssignment(student.assignments)
    ? primaryTeacher(student.teacherName)
    : null;
}

/**
 * 수학 담임. 현재 학생 원장 기준, 원장이 없으면 예약 당시 스냅샷
 *
 * 저장된 예약 스냅샷은 연결된 현재 학생과 수강 분류를 쓸 수 없을 때만 사용
 * 수강 등록별 담임 이름은 추적용이라 근거 타입에서 의도적으로 제외
 */
export function currentOrHistoricMathHomeroomTeacher(
  student: CurrentStudentHomeroomEvidence | null | undefined,
  historicTeacherNameSnapshot: string | null | undefined,
): string | null {
  return student === null || student === undefined
    ? primaryTeacher(historicTeacherNameSnapshot)
    : currentStudentMathHomeroomTeacher(student);
}
