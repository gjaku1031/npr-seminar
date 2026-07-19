import { isRepresentativeStudentClass, isScienceStudentClass } from "./student-classification.js";
import { primaryTeacher } from "./student-display-normalizer.js";

export interface StudentAssignmentClassEvidence {
  readonly className: string;
  readonly sourceActive: boolean;
}

export interface CurrentStudentHomeroomEvidence {
  readonly teacherName: string | null | undefined;
  readonly assignments: readonly StudentAssignmentClassEvidence[];
}

export function hasActiveProjectedMathAssignment(
  assignments: readonly StudentAssignmentClassEvidence[],
): boolean {
  return assignments.some((assignment) => assignment.sourceActive
    && isRepresentativeStudentClass(assignment.className)
    && !isScienceStudentClass(assignment.className));
}

export function currentStudentMathHomeroomTeacher(
  student: CurrentStudentHomeroomEvidence,
): string | null {
  return hasActiveProjectedMathAssignment(student.assignments)
    ? primaryTeacher(student.teacherName)
    : null;
}

/**
 * A stored booking snapshot is used only when the linked current student and
 * its assignment classification are unavailable. Assignment teacher names are
 * intentionally absent from the evidence type because they are traceability-only.
 */
export function currentOrHistoricMathHomeroomTeacher(
  student: CurrentStudentHomeroomEvidence | null | undefined,
  historicTeacherNameSnapshot: string | null | undefined,
): string | null {
  return student === null || student === undefined
    ? primaryTeacher(historicTeacherNameSnapshot)
    : currentStudentMathHomeroomTeacher(student);
}
