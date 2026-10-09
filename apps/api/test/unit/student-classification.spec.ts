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

// 수강 등록 반 분류와 담임 판정
describe("student assignment classification", () => {
  // 대괄호 없는 반 또는 끝의 올바른 시간표 접미사 하나(전각 포함)는 포함
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

  // 앞·중간 대괄호, 관리용 접미사, 여러 접미사, 빈 기본 반, 형식 오류 대괄호는 BRACKETED_CLASS로 제외
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

  // 재원생이 아니면 대괄호 판정보다 NOT_ACTIVE가 우선
  it("gives inactive status precedence over bracket classification", () => {
    expect(classifyStudentAssignment("퇴원생", "과학[연장]")).toEqual({
      included: false,
      exclusionReason: "NOT_ACTIVE",
    });
  });

  // 과학 접미사 반은 유지하고 특강·과목 단독 반은 대표 반에서 제외
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

  // 분류는 접미사를 뗀 기본 반 이름 하나로 하고 원천 값은 바꾸지 않음
  it("uses one suffix-stripped base for classification and keeps raw source values outside the helper", () => {
    expect(studentClassBaseName(" 과1특A[토3] ")).toBe("과1특A");
    expect(studentClassBaseName("과고1가람[일4]")).toBe("과고1가람");
    expect(studentClassBaseName(" 과학 ［토3］ ")).toBe("과학");
    expect(studentClassBaseName("과학[연장]")).toBe("과학[연장]");
    expect(studentClassBaseName("과학*[토3]")).toBe("과학*[토3]");
    expect(studentClassBaseName("과학[월월]")).toBe("과학[월월]");
    expect(studentClassBaseName("과학[Z99]")).toBe("과학[Z99]");
  });

  // 활성 대표 수학 반이 있을 때만 학생 원장 담임을 표시
  it("exposes only the canonical student-row teacher for an active projected math assignment", () => {
    const mathAssignments = [{ className: "고1수학[월수]", sourceActive: true }];
    expect(hasActiveProjectedMathAssignment(mathAssignments)).toBe(true);
    expect(currentStudentMathHomeroomTeacher({
      teacherName: " 수학담임，공동담임 ",
      assignments: mathAssignments,
    })).toBe("수학담임");
  });

  // 과학 반만·비활성 수학 반·과목 단독 반이면 담임 null
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

  // 현재 학생 근거가 없을 때만 예약 당시 담임 스냅샷 사용
  it("uses a historic snapshot only when current student classification evidence is unavailable", () => {
    expect(currentOrHistoricMathHomeroomTeacher(null, " 과거담임，부담임 ")).toBe("과거담임");
    expect(currentOrHistoricMathHomeroomTeacher({
      teacherName: "현재행담임",
      assignments: [],
    }, "과거담임")).toBeNull();
  });

  // 회귀 방지: `09-` 반이 대표 반으로 뽑혀 634명의 반·단위·담임이 한꺼번에 비었던 사례
  // 원인은 정렬. 반 이름 오름차순 첫 번째를 고르는데 "09-1M4A"가 숫자 0 때문에 "1M4A"보다 항상 앞섬
  // 다음 학기 사전 배정 반은 대표 반 후보가 아님
  it("다음 학기 사전 배정 반은 대표 반 후보가 아니다", () => {
    for (const className of ["09-1M4A", "09-4M3", "12-3M1"]) {
      expect(isFutureTermStudentClass(className)).toBe(true);
      expect(isRepresentativeStudentClass(className)).toBe(false);
    }
  });

  // 월 접두처럼 보여도 현재 반은 대표 반
  it("현재 반은 월 접두처럼 보여도 그대로 대표 반이다", () => {
    for (const className of ["1M4A", "6T3D", "13-1A", "2M1B", "과1중2과학(토1)"]) {
      expect(isFutureTermStudentClass(className)).toBe(false);
      expect(isRepresentativeStudentClass(className)).toBe(true);
    }
  });

  // 다음 학기 반도 원천 사실이므로 수강 등록으로는 포함
  it("다음 학기 반도 배정 자체로는 계속 받아 둔다 — 원천에 있는 사실이다", () => {
    expect(classifyStudentAssignment("재원생", "09-1M4A")).toEqual({ included: true, exclusionReason: null });
  });
});
