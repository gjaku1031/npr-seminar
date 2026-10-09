import { describe, expect, it } from "vitest";
import { selectCheckInRepresentativeStudent } from "../../src/modules/check-ins/check-ins.service.js";

/**
 * 대표 학생 후보. 기본값은 A 중1 재원생
 *
 * @param overrides 덮어쓸 스냅샷 필드
 */
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
    branchCodeAtBooking: "CAMPUS_A",
    classNameSnapshot: "1M1A",
    schoolNameSnapshot: "가락중",
    gradeSnapshot: "중1",
    unitNameSnapshot: "중등1",
    ...overrides,
  };
}

// 입장 결과에 표시할 대표 학생 선택
describe("check-in representative student", () => {
  // QR·수동 입장 모두 학년이 가장 높은 학생 선택
  it("selects the highest grade for both QR and manual outcome projection", () => {
    expect(selectCheckInRepresentativeStudent([
      candidate({ studentNameSnapshot: "중학생", gradeSnapshot: "중3" }),
      candidate({ studentNameSnapshot: "고등학생", gradeSnapshot: "고1", schoolNameSnapshot: "한빛고" }),
      candidate({ studentNameSnapshot: "초등학생", gradeSnapshot: "초6", schoolNameSnapshot: "가동초" }),
    ])).toMatchObject({ studentName: "고등학생", grade: "고1" });
  });

  // 같은 학년이면 캠퍼스·단위·반·이름·학번 순으로 결정
  it("breaks equal-grade ties by campus, unit, class, name, then student number", () => {
    const selected = selectCheckInRepresentativeStudent([
      candidate({ branchCodeAtBooking: "CAMPUS_B", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "CAMPUS_A", unitNameSnapshot: "중등2", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "CAMPUS_A", unitNameSnapshot: "중등1", classNameSnapshot: "2M1A", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "CAMPUS_A", unitNameSnapshot: "중등1", classNameSnapshot: "1M1A", studentNameSnapshot: "나다", sourceStudentNoSnapshot: "001" }),
      candidate({ branchCodeAtBooking: "CAMPUS_A", unitNameSnapshot: "중등1", classNameSnapshot: "1M1A", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "002" }),
      candidate({ branchCodeAtBooking: "CAMPUS_A", unitNameSnapshot: "중등1", classNameSnapshot: "1M1A", studentNameSnapshot: "가나", sourceStudentNoSnapshot: "001" }),
    ]);
    expect(selected).toMatchObject({ branch: "CAMPUS_A", unitName: "중등1", className: "1M1A", studentName: "가나", sourceStudentNo: "001" });
  });

  // 학교 이름 중간 글자로 학교급을 추정하지 않음
  it("does not infer a school level from a character in the middle of the school name", () => {
    expect(selectCheckInRepresentativeStudent([
      candidate({ studentNameSnapshot: "고덕중 학생", gradeSnapshot: "1학년", schoolNameSnapshot: "고덕중", unitNameSnapshot: "중등1" }),
      candidate({ studentNameSnapshot: "중대초 학생", gradeSnapshot: "6학년", schoolNameSnapshot: "중대초", unitNameSnapshot: "초등" }),
    ])).toMatchObject({ studentName: "고덕중 학생", grade: "1학년" });
  });

  // 예약 학생이 없는 잘못된 스캔은 null
  it("returns null when an invalid scan resolves to no booking students", () => {
    expect(selectCheckInRepresentativeStudent([])).toBeNull();
  });
});
