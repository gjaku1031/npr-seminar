import { describe, expect, it } from "vitest";
import {
  classifyStudentAssignment,
  isAllowedStudentAssignmentClass,
  isFutureTermStudentClass,
  isRepresentativeStudentClass,
  isScienceStudentClass,
  studentClassBaseName,
} from "../../src/modules/student-sync/student-classification.js";
import {
  currentOrHistoricMathHomeroomTeacher,
  currentStudentMathHomeroomTeacher,
  hasActiveProjectedMathAssignment,
} from "../../src/modules/student-sync/student-homeroom-policy.js";

describe("student assignment classification", () => {
  it.each([
    "3T3A",
    "과1특A[토3]",
    "과고1가람[일4]",
    "고1수학[월토1]",
    "고1수학[월수]",
    "고1수학[월수금1]",
    "고1영재[E3]",
    "고1영재[e3]",
    "기하[일1]",
    "  과1특A［토3］  ",
    " 과학 ［토3］ ",
    "고1영재［Ｅ３］",
  ])("accepts a bracketless class or one normalized trailing timetable suffix: %s", (className) => {
    expect(isAllowedStudentAssignmentClass(className)).toBe(true);
    expect(classifyStudentAssignment(" 재원생 ", className)).toEqual({ included: true, exclusionReason: null });
  });

  it.each([
    "[26특-과]과1A",
    "과학[연장]",
    "과학[26여름]",
    "과학[토3][일4]",
    "과학[토3]보강",
    "과학[토3",
    "과학토3]",
    "[토3]",
    "과학*[토3]",
    "과학[월월]",
    "과학[일00]",
    "과학[일01]",
    "과학[Z99]",
    "   ",
  ])("rejects leading, middle, management, multiple, empty-base, and malformed brackets: %s", (className) => {
    expect(isAllowedStudentAssignmentClass(className)).toBe(false);
    expect(classifyStudentAssignment("재원생", className)).toEqual({
      included: false,
      exclusionReason: "BRACKETED_CLASS",
    });
  });

  it("gives inactive status precedence over bracket classification", () => {
    expect(classifyStudentAssignment("퇴원생", "과학[연장]")).toEqual({
      included: false,
      exclusionReason: "NOT_ACTIVE",
    });
  });

  it("keeps science suffix classes while excluding special and subject-only classes from representation", () => {
    expect(isScienceStudentClass("과1특A[토3]")).toBe(true);
    expect(isScienceStudentClass("과고1가람[일4]")).toBe(true);
    expect(isRepresentativeStudentClass("과1특A[토3]")).toBe(true);
    expect(isRepresentativeStudentClass("여름특강")).toBe(false);
    expect(isRepresentativeStudentClass("TEST 패키지")).toBe(false);
    expect(isRepresentativeStudentClass("기하[일1]")).toBe(false);
    expect(isRepresentativeStudentClass("과학[연장]")).toBe(false);
    expect(isRepresentativeStudentClass("과학*[토3]")).toBe(false);
  });

  it("uses one suffix-stripped base for classification and keeps raw source values outside the helper", () => {
    expect(studentClassBaseName(" 과1특A[토3] ")).toBe("과1특A");
    expect(studentClassBaseName("과고1가람[일4]")).toBe("과고1가람");
    expect(studentClassBaseName(" 과학 ［토3］ ")).toBe("과학");
    expect(studentClassBaseName("과학[연장]")).toBe("과학[연장]");
    expect(studentClassBaseName("과학*[토3]")).toBe("과학*[토3]");
    expect(studentClassBaseName("과학[월월]")).toBe("과학[월월]");
    expect(studentClassBaseName("과학[Z99]")).toBe("과학[Z99]");
  });

  it("exposes only the canonical student-row teacher for an active projected math assignment", () => {
    const mathAssignments = [{ className: "고1수학[월수]", sourceActive: true }];
    expect(hasActiveProjectedMathAssignment(mathAssignments)).toBe(true);
    expect(currentStudentMathHomeroomTeacher({
      teacherName: " 수학담임，공동담임 ",
      assignments: mathAssignments,
    })).toBe("수학담임");
  });

  it("returns null for science-only, inactive-math, and subject-only current evidence", () => {
    for (const assignments of [
      [{ className: "과고2역학SKY[일5]", sourceActive: true }],
      [{ className: "고1수학[월수]", sourceActive: false }],
      [{ className: "기하[일1]", sourceActive: true }],
    ]) {
      expect(currentOrHistoricMathHomeroomTeacher({ teacherName: "학생행담임", assignments }, "과거담임"))
        .toBeNull();
    }
  });

  it("uses a historic snapshot only when current student classification evidence is unavailable", () => {
    expect(currentOrHistoricMathHomeroomTeacher(null, " 과거담임，부담임 ")).toBe("과거담임");
    expect(currentOrHistoricMathHomeroomTeacher({
      teacherName: "현재행담임",
      assignments: [],
    }, "과거담임")).toBeNull();
  });

  /**
   * 회귀 방지: `09-` 반이 대표 반으로 뽑히면서 634명의 반·단위·담임이 한꺼번에 비었다.
   * 원인은 정렬이었다 — `assignmentOrder` 가 반명 오름차순의 첫 번째를 고르는데
   * `"09-1M4A"` 는 숫자 0 때문에 `"1M4A"` 보다 항상 앞선다. 규칙이 아니라 우연이 골랐다.
   */
  it("다음 학기 사전 배정 반은 대표 반 후보가 아니다", () => {
    for (const className of ["09-1M4A", "09-4M3", "12-3M1"]) {
      expect(isFutureTermStudentClass(className)).toBe(true);
      expect(isRepresentativeStudentClass(className)).toBe(false);
    }
  });

  it("현재 반은 월 접두처럼 보여도 그대로 대표 반이다", () => {
    for (const className of ["1M4A", "6T3D", "13-1A", "2M1B", "과1중2과학(토1)"]) {
      expect(isFutureTermStudentClass(className)).toBe(false);
      expect(isRepresentativeStudentClass(className)).toBe(true);
    }
  });

  it("다음 학기 반도 배정 자체로는 계속 받아 둔다 — 원천에 있는 사실이다", () => {
    expect(classifyStudentAssignment("재원생", "09-1M4A")).toEqual({ included: true, exclusionReason: null });
  });
});
