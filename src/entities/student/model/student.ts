/**
 * 재원생(Student) 도메인 모델 — 명세 §2 · §4.
 */

/** 비재원생 → 재원생 전환 이력 (명세 12.14) */
export interface ConvertedFrom {
  sessionId: string;
  resId: string;
  when: Date;
}

export interface Student {
  id: string;
  name: string;
  school: string;
  /** 학년 표기 예: "중2" */
  grade: string;
  /** 반 배정 전이면 null. 반 이름(className)은 Class에서 파생 — 중복 저장하지 않는다 */
  classId: string | null;
  parentPhone: string;
  /** 노쇼 누적 횟수 — 설명회 종료 시 증가 (명세 12.4) */
  noShowCount: number;
  /** 전환으로 생성된 학생이면 출처 기록, 아니면 null (명세 12.14) */
  convertedFrom: ConvertedFrom | null;
}

/** 학생 추가 입력 — 명세 §4.8 (이름·연락처 필수) */
export interface StudentDraft {
  name: string;
  school: string;
  grade: string;
  classId: string | null;
  parentPhone: string;
}

/** 부문 필터 (명세 §4.3) */
export type StudentDivision = "all" | "elementary" | "middle" | "high";

/** 예약상태 필터 (명세 §4.7) — 설명회 기준으로 판정 */
export type StudentReservationFilter = "all" | "reserved" | "entered" | "none";

/** 전환 학생 여부 — 명단에 '전환' 배지 표시 (명세 §4.1) */
export function isConverted(student: Student): boolean {
  return student.convertedFrom !== null;
}

/** 연락처 뒷자리 매칭 — 현장 입장 조회(4자리)·모바일 조회에 사용 (명세 §8.6 · 10.2) */
export function matchesPhoneSuffix(parentPhone: string, suffix: string): boolean {
  const digits = parentPhone.replace(/\D/g, "");
  const target = suffix.replace(/\D/g, "");
  return target.length > 0 && digits.endsWith(target);
}
