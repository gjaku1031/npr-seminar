/**
 * 재원생(Student) 도메인 모델 — 명세 v4.0 §2.
 *
 * v4.0 개편: 학번(no)·모/부 연락처·담임명·캠퍼스·단위 추가.
 * parentPhone 단수 → motherPhone/fatherPhone — 조회·현장 입장은 **모/부 모두 매칭**한다.
 * 반명·담임명·캠퍼스·단위는 명세 §2 모델 그대로 보관한다(11열 테이블이 직접 표시).
 *
 * v2.0 대비 제거: noShowCount(노쇼는 예약 상태로만 내부 집계 — 명세 §6.6),
 * convertedFrom(비재원 전환 기능 폐기), 학생 추가·엑셀 업로드(재원생 명단은 읽기 전용 참조).
 */

import type { Campus } from "@/shared/config/campus";

export interface Student {
  id: string;
  /** 학번 — 예: "240101" (명세 §4.4 테이블 2열) */
  no: string;
  name: string;
  school: string;
  /** 학년 표기 예: "고1" */
  grade: string;
  classId: string;
  /** 반명 — 단위 판정의 입력 (명세 §2.1) */
  className: string;
  teacherName: string;
  campus: Campus;
  /** unitOf(className) 파생값 (명세 §2.1) */
  unit: string;
  motherPhone: string;
  fatherPhone: string;
}

/**
 * 연락처 매칭 — 모/부 모두 검사한다 (명세 §9.3 · §10.3).
 * digits: 숫자만 남긴 검색어(부분·뒷자리). 4자리 미만은 매칭하지 않는다(현장 입장 규칙).
 */
export function matchesParentPhone(student: Student, digits: string): boolean {
  if (digits.length < 4) return false;
  return (
    student.motherPhone.replace(/\D/g, "").includes(digits) ||
    student.fatherPhone.replace(/\D/g, "").includes(digits)
  );
}

/**
 * 어느 쪽 번호에 매칭됐는지 — 모바일 재원생 예약의 reservedBy 기본값 (명세 §10.4).
 * 부 번호에만 매칭되면 '부', 그 외(모 매칭·양쪽 매칭)는 '모'.
 */
export function matchedParent(student: Student, digits: string): "모" | "부" {
  const mother = student.motherPhone.replace(/\D/g, "").includes(digits);
  const father = student.fatherPhone.replace(/\D/g, "").includes(digits);
  return father && !mother ? "부" : "모";
}
