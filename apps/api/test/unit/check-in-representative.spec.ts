import { describe, expect, it } from "vitest";
import { selectCheckInRepresentativeStudent } from "../../src/modules/check-ins/check-ins.service.js";

function candidate(overrides: Partial<{
  participantType: string;
  sourceStudentNoSnapshot: string;
  studentNameSnapshot: string;
  branchCodeAtBooking: string;
  classNameSnapshot: string;
  schoolNameSnapshot: string | null;
  gradeSnapshot: string | null;
  unitNameSnapshot: string | null;
}> = {}) {
  return {
    participantType: "ENROLLED",
    sourceStudentNoSnapshot: "100",
    studentNameSnapshot: "기본",
    branchCodeAtBooking: "SONGPA",
    classNameSnapshot: "1M1A",
    schoolNameSnapshot: "가락중",
    gradeSnapshot: "중1",
    unitNameSnapshot: "중등1",
    ...overrides,
  };
}

describe("check-in representative student", () => {
  it("selects the highest grade for both QR and manual outcome projection", () => {
    expect(selectCheckInRepresentativeStudent([
      candidate({ studentNameSnapshot: "중학생", gradeSnapshot: "중3" }),
      candidate({ studentNameSnapshot: "고등학생", gradeSnapshot: "고1", schoolNameSnapshot: "한빛고" }),
      candidate({ studentNameSnapshot: "초등학생", gradeSnapshot: "초6", schoolNameSnapshot: "가동초" }),
    ])).toMatchObject({ studentName: "고등학생", grade: "고1" });
  });

  it("breaks equal-grade ties by campus, unit, class, name, then student number", () => {
    const selected = selectCheckInRepresentativeStudent([
      candidate({ branchCodeAtBooking: "WIRYE", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "SONGPA", unitNameSnapshot: "중등2", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "SONGPA", unitNameSnapshot: "중등1", classNameSnapshot: "2M1A", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "SONGPA", unitNameSnapshot: "중등1", classNameSnapshot: "1M1A", studentNameSnapshot: "나다", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "SONGPA", unitNameSnapshot: "중등1", classNameSnapshot: "1M1A", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "002" }),
      candidate({ branchCodeAtBooking: "SONGPA", unitNameSnapshot: "중등1", classNameSnapshot: "1M1A", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
    ]);
    expect(selected).toMatchObject({ branch: "SONGPA", unitName: "중등1", className: "1M1A", studentName: "가나", sourceStudentNo: "001" });
  });

  it("does not infer a school level from a character in the middle of the school name", () => {
    expect(selectCheckInRepresentativeStudent([
      candidate({ studentNameSnapshot: "고덕중 학생", gradeSnapshot: "1학년", schoolNameSnapshot: "고덕중", unitNameSnapshot: "중등1" }),
      candidate({ studentNameSnapshot: "중대초 학생", gradeSnapshot: "6학년", schoolNameSnapshot: "중대초", unitNameSnapshot: "초등" }),
    ])).toMatchObject({ studentName: "고덕중 학생", grade: "1학년" });
  });

  it("returns null when an invalid scan resolves to no booking students", () => {
    expect(selectCheckInRepresentativeStudent([])).toBeNull();
  });
});
