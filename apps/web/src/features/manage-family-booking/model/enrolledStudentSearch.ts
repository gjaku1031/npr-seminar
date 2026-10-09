/**
 * 재원생 수동 예약을 위한 학생 검색 순수 로직 (계약 tag: Admin students)
 *
 * 왜 features 안에 두는가: 응답을 읽는 어댑터(`shared/api/admin-students.ts`)는 다른 담당의
 * 소유라 이 화면 때문에 넓히지 않음. 그래서 이 모듈이 그 응답을 여기서 방어적으로 읽어
 * 화면이 쓰는 최소 모양으로 좁힘 — 회차 예약 필드(계약 확정 전)는 있으면 쓰고 없으면 미예약
 *
 * 연락처는 write-only 임. 이 모듈은 비교만 하고 저장·로깅하지 않음
 */

import type { Branch, FamilyBookingStatus } from "@/shared/api";

/**
 * 계약 studentIds 최대치 — 대표 1명 + 형제. 서버가 1~10 을 강제함
 */
export const ENROLLED_BOOKING_MAX_STUDENTS = 10;

/**
 * `listAdminStudents` 항목에서 이 화면이 읽는 필드. 학생 본체 필드는 계약에 있고,
 * 회차 예약 필드(`reservation`/`hasReservation`/`reservationStatus`)는 배포에 따라 이름이
 * 다를 수 있어 셋 다 선택으로 받아 있는 것을 씀
 */
export interface RawEnrolledStudent {
  /**
   * 학생 ID
   */
  studentId: string;

  /**
   * 이름
   */
  name: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 학교
   */
  schoolName: string | null;

  /**
   * 학년
   */
  grade: string | null;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 수학 정규반. 없으면 null
   */
  mathClassName: string | null;

  /**
   * 과학 반 목록
   */
  scienceClassNames: string[];

  /**
   * 어머니 연락처
   */
  motherPhone: string | null;

  /**
   * 아버지 연락처
   */
  fatherPhone: string | null;

  /**
   * 선택 회차 예약 투영
   */
  reservation?: { status?: FamilyBookingStatus | null } | null;

  /**
   * 레거시 응답의 최상위 예약 상태
   */
  reservationStatus?: FamilyBookingStatus | "NONE" | null;
}

/**
 * 화면이 쓰는 재원생 후보 — 검색 결과 한 명
 */
export interface EnrolledStudentCandidate {
  /**
   * 학생 ID
   */
  studentId: string;

  /**
   * 이름
   */
  name: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 학교
   */
  schoolName: string | null;

  /**
   * 학년
   */
  grade: string | null;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 수학 정규반. 없으면 null
   */
  mathClassName: string | null;

  /**
   * 과학 반 목록
   */
  scienceClassNames: string[];
  /**
   * ADMIN 전용 전체 번호 — 대표 연락처 선택·형제 매칭에만 쓰고 저장·로깅하지 않음
   */
  motherPhone: string | null;

  /**
   * 아버지 연락처
   */
  fatherPhone: string | null;
  /**
   * 이 회차의 예약 상태. 없으면 null(미예약). NONE 도 null 로 접음
   */
  reservationStatus: FamilyBookingStatus | null;
}

/**
 * 응답 한 항목 → 후보. 회차 예약 상태는 `reservation.status` 를 먼저 보고, 없으면
 * `reservationStatus`(NONE 은 미예약) 를 봄 — 지어내지 않고 있는 값만 접음
 */
export function normalizeEnrolledCandidate(raw: RawEnrolledStudent): EnrolledStudentCandidate {
  let reservationStatus: FamilyBookingStatus | null = null;
  if (raw.reservation != null && raw.reservation.status != null) {
    reservationStatus = raw.reservation.status;
  } else if (raw.reservationStatus != null && raw.reservationStatus !== "NONE") {
    reservationStatus = raw.reservationStatus;
  }

  return {
    studentId: raw.studentId,
    name: raw.name,
    branch: raw.branch,
    schoolName: raw.schoolName,
    grade: raw.grade,
    sourceStudentNo: raw.sourceStudentNo,
    mathClassName: raw.mathClassName,
    scienceClassNames: Array.isArray(raw.scienceClassNames) ? raw.scienceClassNames : [],
    motherPhone: raw.motherPhone,
    fatherPhone: raw.fatherPhone,
    reservationStatus,
  };
}

/**
 * 이 회차에 이미 활성/입장 예약이 있어 새로 담을 수 없는 후보인가
 *
 * 서버가 막는 것은 활성(RESERVED)·입장(CHECKED_IN) 중복임. 취소(CANCELLED)·미참석(NO_SHOW)
 * 은 여기서 막지 않음 — 명단(booked-only)에도 이미 오르지 않은 상태임
 */
export function candidateAlreadyBooked(candidate: Pick<EnrolledStudentCandidate, "reservationStatus">): boolean {
  return candidate.reservationStatus === "RESERVED" || candidate.reservationStatus === "CHECKED_IN";
}

/**
 * 재원생 예약 대표 연락처 후보
 */
export interface EnrolledContactChoice {
  /**
   * 연락처 주인. 모 또는 부
   */
  party: "MOTHER" | "FATHER";

  /**
   * 표시 문구
   */
  label: string;

  /**
   * 연락처 원문
   */
  contact: string;
}

/**
 * 후보의 대표 연락처 후보 — 저장된 모/부만. BOTH 라는 대표 연락처는 계약에 없으므로
 * 참석이 모+부여도 대표는 한쪽을 고름. 서버가 이 번호의 digest 로 소유를 검증함
 */
export function candidateContactChoices(
  candidate: Pick<EnrolledStudentCandidate, "motherPhone" | "fatherPhone">,
): EnrolledContactChoice[] {
  const choices: EnrolledContactChoice[] = [];
  if (candidate.motherPhone !== null) choices.push({ party: "MOTHER", label: "모", contact: candidate.motherPhone });
  if (candidate.fatherPhone !== null) choices.push({ party: "FATHER", label: "부", contact: candidate.fatherPhone });
  return choices;
}

/**
 * 연락처 뒤 4자리 — 서버 검색용. 숫자만 남겨 마지막 4자리를 뽑음
 */
export function contactLast4(contact: string): string {
  return contact.replace(/\D/g, "").slice(-4);
}

/**
 * 같은 대표 연락처를 쓰는 형제 후보 — 서버는 뒤 4자리로만 좁혀 주므로, 그 결과를 여기서
 * 전체 번호 완전 일치로 다시 좁힘(뒤 4자리가 같아도 다른 번호일 수 있음). 대표 학생 본인과
 * 이미 활성/입장 예약이 있는 후보는 뺌. 연락처는 비교만 하고 저장·로깅하지 않음
 */
export function exactContactSiblingCandidates(
  candidates: readonly EnrolledStudentCandidate[],
  fullContact: string,
  primaryStudentId: string,
): EnrolledStudentCandidate[] {
  return candidates.filter(
    (candidate) =>
      candidate.studentId !== primaryStudentId &&
      !candidateAlreadyBooked(candidate) &&
      (candidate.motherPhone === fullContact || candidate.fatherPhone === fullContact),
  );
}
