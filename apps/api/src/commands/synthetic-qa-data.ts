// 합성 QA 데이터 계획. 실제 개인정보 없이 운영 규모와 분포를 재현하는 결정적 데이터
import { createHash } from "node:crypto";
import { canonicalUnitName } from "../modules/student-sync/student-display-normalizer.js";
import {
  isRepresentativeStudentClass,
  isScienceStudentClass,
} from "../modules/student-sync/student-classification.js";

/**
 * 지점 코드
 */
export type QaBranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

/**
 * 단위 그룹
 */
export type QaUnitGroup = "ELEMENTARY" | "MIDDLE_1" | "MIDDLE_2" | "MIDDLE_3" | "SPECIAL_PURPOSE" | "HIGH" | "SCIENCE";

/**
 * 예약 상태
 */
export type QaBookingStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

/**
 * 계획 전체 기대 건수. 생성 결과가 다르면 실패
 */
export const EXPECTED_QA_COUNTS = {
  /**
   * 학생 수
   */
  students: 3_382,

  /**
   * 수강 등록 수
   */
  assignments: 3_805,

  /**
   * 수강 등록이 여러 개인 학생 수
   */
  multiAssignmentStudents: 372,

  /**
   * 설명회 수
   */
  seminars: 4,

  /**
   * 회차 수
   */
  sessions: 6,

  /**
   * 기능 확인(POC) 회차 예약 수
   */
  pocBookings: 17,

  /**
   * 부하 검증 회차 예약 수
   */
  loadBookings: 1_500,

  /**
   * 스캐너 기기 수
   */
  scanners: 6,
} as const;

/**
 * 지점별 학생 수
 */
export const QA_BRANCH_STUDENT_COUNTS: Readonly<Record<QaBranchCode, number>> = {
  CAMPUS_A: 1_739,
  CAMPUS_B: 795,
  CAMPUS_C: 848,
};

/**
 * 수강 등록 초안
 */
export interface QaAssignmentDraft {
  /**
   * 계획 내 고유 키
   */
  readonly key: string;

  /**
   * 반 이름
   */
  readonly className: string;

  /**
   * 담임
   */
  readonly teacherName: string | null;

  /**
   * 단위
   */
  readonly unitName: string | null;
}

/**
 * 학생 초안
 */
export interface QaStudentDraft {
  /**
   * 계획 내 고유 키 `{지점}-{4자리 순번}`
   */
  readonly key: string;

  /**
   * 결정적 공개 ID
   */
  readonly publicId: string;

  /**
   * 학번 `QA-{지점 앞 2자}-{6자리}`
   */
  readonly sourceStudentNo: string;

  /**
   * 지점
   */
  readonly branchCode: QaBranchCode;

  /**
   * 이름 `QA학생{4자리}`
   */
  readonly name: string;

  /**
   * 원장 대표 반
   */
  readonly className: string;

  /**
   * 학교
   */
  readonly schoolName: string;

  /**
   * 학년
   */
  readonly grade: string;

  /**
   * 담임
   */
  readonly teacherName: string | null;

  /**
   * 단위
   */
  readonly unitName: string | null;

  /**
   * 어머니 연락처
   */
  readonly motherPhone: string;

  /**
   * 아버지 연락처
   */
  readonly fatherPhone: string;

  /**
   * 대표 반 판정 결과
   */
  readonly classResolutionStatus: "ONE_REGULAR" | "SCIENCE_ONLY" | "AMBIGUOUS_FALLBACK";

  /**
   * 판정 불가 사유
   */
  readonly classResolutionReason: "MULTIPLE_REGULAR" | "NO_CLASS" | null;

  /**
   * 수강 등록. 계획 조립 중 추가되므로 가변 배열
   */
  readonly assignments: QaAssignmentDraft[];
}

/**
 * 설명회 초안
 */
export interface QaSeminarDraft {
  /**
   * 고유 키
   */
  readonly key: string;

  /**
   * 결정적 공개 ID
   */
  readonly publicId: string;

  /**
   * 제목
   */
  readonly title: string;

  /**
   * 상태
   */
  readonly status: "PUBLISHED" | "ARCHIVED";
}

/**
 * 회차 초안
 */
export interface QaSessionDraft {
  /**
   * 고유 키
   */
  readonly key: string;

  /**
   * 결정적 공개 ID
   */
  readonly publicId: string;

  /**
   * 설명회 키
   */
  readonly seminarKey: string;

  /**
   * 대상 범위
   */
  readonly scope: "ALL" | "BRANCH";

  /**
   * 지점. 전 지점 회차는 null
   */
  readonly branchCode: QaBranchCode | null;

  /**
   * 제목
   */
  readonly title: string;

  /**
   * 장소
   */
  readonly place: string;

  /**
   * 시작 시각
   */
  readonly startsAt: Date;

  /**
   * 종료 시각
   */
  readonly endsAt: Date;

  /**
   * 예약 시작 시각
   */
  readonly bookingOpensAt: Date;

  /**
   * 예약 마감 시각
   */
  readonly bookingClosesAt: Date;

  /**
   * 비재원생 예약 허용 여부
   */
  readonly guestBookingEnabled: boolean;

  /**
   * 회차 상태
   */
  readonly status: "OPEN" | "CLOSED";
}

/**
 * 예약 초안
 */
export interface QaBookingDraft {
  /**
   * 고유 키
   */
  readonly key: string;

  /**
   * 결정적 공개 ID
   */
  readonly publicId: string;

  /**
   * 회차 키
   */
  readonly sessionKey: string;

  /**
   * 재원생 학생 키 목록. 비재원생 예약은 빈 목록
   */
  readonly studentKeys: readonly string[];

  /**
   * 비재원생 정보. 재원생 예약은 null
   */
  readonly guest: { readonly branchCode: QaBranchCode; readonly ordinal: number } | null;

  /**
   * 보호자 연락처
   */
  readonly contactPhone: string;

  /**
   * 참석 보호자
   */
  readonly attendanceParty: "MOTHER" | "FATHER" | "BOTH";

  /**
   * 예약 인원
   */
  readonly seatCount: 1 | 2;

  /**
   * 예약 상태
   */
  readonly status: QaBookingStatus;

  /**
   * 예약 경로
   */
  readonly bookingSource: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";

  /**
   * 생성 시각
   */
  readonly createdAt: Date;
}

/**
 * 합성 QA 데이터 계획
 */
export interface SyntheticQaPlan {
  /**
   * 학생
   */
  readonly students: readonly QaStudentDraft[];

  /**
   * 설명회
   */
  readonly seminars: readonly QaSeminarDraft[];

  /**
   * 회차
   */
  readonly sessions: readonly QaSessionDraft[];

  /**
   * 예약
   */
  readonly bookings: readonly QaBookingDraft[];
}

/**
 * 지점별 학생 분포 계획
 */
interface BranchPlan {
  /**
   * 단위별 학생 수
   */
  readonly units: Readonly<Record<QaUnitGroup, number>>;

  /**
   * 단위별 수학+과학 동시 수강 학생 수. UNRESOLVED는 단위 미판정 수학 반 학생
   */
  readonly mathScience: Partial<Readonly<Record<QaUnitGroup | "UNRESOLVED", number>>>;

  /**
   * 반 없는 학생 수
   */
  readonly noClass: number;

  /**
   * 단위 미판정 수학 반 학생 수
   */
  readonly unresolvedMath: number;

  /**
   * 형제(같은 연락처 2명) 가족 수
   */
  readonly siblingPairs: number;
}

/**
 * 지점별 분포. 운영 학생 분포를 본뜬 고정 값
 */
const BRANCH_PLANS: Readonly<Record<QaBranchCode, BranchPlan>> = {
  CAMPUS_A: {
    units: { ELEMENTARY: 495, MIDDLE_1: 337, MIDDLE_2: 273, MIDDLE_3: 230, SPECIAL_PURPOSE: 187, HIGH: 150, SCIENCE: 67 },
    mathScience: { ELEMENTARY: 7, MIDDLE_1: 8, MIDDLE_2: 18, MIDDLE_3: 38, SPECIAL_PURPOSE: 29, HIGH: 14 },
    noClass: 0, unresolvedMath: 0, siblingPairs: 250,
  },
  CAMPUS_B: {
    units: { ELEMENTARY: 174, MIDDLE_1: 107, MIDDLE_2: 117, MIDDLE_3: 92, SPECIAL_PURPOSE: 104, HIGH: 103, SCIENCE: 97 },
    mathScience: { MIDDLE_1: 5, MIDDLE_2: 4, MIDDLE_3: 7, SPECIAL_PURPOSE: 29, HIGH: 19 },
    noClass: 1, unresolvedMath: 0, siblingPairs: 125,
  },
  CAMPUS_C: {
    units: { ELEMENTARY: 236, MIDDLE_1: 86, MIDDLE_2: 105, MIDDLE_3: 94, SPECIAL_PURPOSE: 0, HIGH: 89, SCIENCE: 223 },
    mathScience: { ELEMENTARY: 8, MIDDLE_1: 14, MIDDLE_2: 26, MIDDLE_3: 30, HIGH: 31, UNRESOLVED: 1 },
    noClass: 2, unresolvedMath: 13, siblingPairs: 125,
  },
};

/**
 * 지점 순서
 */
const BRANCHES: readonly QaBranchCode[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];

/**
 * 단위 순서
 */
const UNITS: readonly QaUnitGroup[] = ["ELEMENTARY", "MIDDLE_1", "MIDDLE_2", "MIDDLE_3", "SPECIAL_PURPOSE", "HIGH", "SCIENCE"];

/**
 * 종류·키로 결정적 UUID v4 생성. 같은 입력은 항상 같은 ID
 */
export function stableQaUuid(kind: string, key: string): string {
  const bytes = createHash("sha256").update(`npr:synthetic-qa:v1:${kind}:${key}`).digest().subarray(0, 16);
  // 런타임 경로는 모든 공개 ID를 UUID v4로 검증함
  // 재현 가능한 결정적 값이지만 운영 생성 ID와 같은 RFC 4122 버전·변형 비트를 설정
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 결정적 SHA-256 다이제스트. Prisma Bytes 입력용 복사본
 */
export function stableQaDigest(value: string): Uint8Array<ArrayBuffer> {
  const digest = createHash("sha256").update(`npr:synthetic-qa:v1:${value}`).digest();
  const copy = new Uint8Array(new ArrayBuffer(digest.byteLength));
  copy.set(digest);
  return copy;
}

/**
 * 합성 QA 데이터 계획 생성과 기대 건수 검증
 *
 * @throws {Error} 계획 건수가 기대와 다름
 */
export function buildSyntheticQaPlan(): SyntheticQaPlan {
  const students = buildStudents();
  const seminars = buildSeminars();
  const sessions = buildSessions();
  const bookings = buildBookings(students);
  assertPlan(students, seminars, sessions, bookings);
  return { students, seminars, sessions, bookings };
}

/**
 * 학생과 수강 등록 생성
 *
 * 1. 지점·단위별 정규 반(일부는 과학 반 동시 수강), 과학 반만 있는 학생
 * 2. 단위 미판정 수학 반 학생, 반 없는 학생
 * 3. 정규 반 여러 개 학생 1명과 기하[시간]·특강 추가 등록 학생 83명
 *
 * @throws {Error} 단위 판정 실패·지점 건수 불일치
 */
function buildStudents(): QaStudentDraft[] {
  const students: QaStudentDraft[] = [];
  let globalOrdinal = 0;
  for (const [branchIndex, branchCode] of BRANCHES.entries()) {
    const plan = BRANCH_PLANS[branchCode];
    let localOrdinal = 0;
    for (const unit of UNITS) {
      const count = plan.units[unit];
      for (let unitOrdinal = 0; unitOrdinal < count; unitOrdinal += 1) {
        globalOrdinal += 1;
        const key = `${branchCode}-${String(localOrdinal + 1).padStart(4, "0")}`;
        const scienceOnly = unit === "SCIENCE";
        const representativeClass = scienceOnly
          ? scienceClassName(branchCode, unitOrdinal)
          : mathClassName(unit, unitOrdinal);
        const canonicalUnit = scienceOnly ? "과학" : canonicalUnitName(representativeClass);
        if (canonicalUnit === null) throw new Error(`QA class did not resolve to a unit: ${representativeClass}`);
        const teacherName = scienceOnly ? null : teacherFor(globalOrdinal);
        const assignments: QaAssignmentDraft[] = [{
          key: `${key}-A01`, className: representativeClass,
          teacherName, unitName: canonicalUnit,
        }];
        const scienceCount = plan.mathScience[unit] ?? 0;
        if (!scienceOnly && unitOrdinal < scienceCount) {
          assignments.push({
            key: `${key}-A02`, className: scienceClassName(branchCode, unitOrdinal),
            teacherName: null, unitName: "과학",
          });
        }
        const phones = phonesFor(branchIndex, localOrdinal, plan.siblingPairs);
        students.push({
          key, publicId: stableQaUuid("student", key),
          sourceStudentNo: `QA-${branchCode.slice(0, 2)}-${String(localOrdinal + 1).padStart(6, "0")}`,
          branchCode, name: `QA학생${String(globalOrdinal).padStart(4, "0")}`,
          className: scienceOnly ? "과학" : representativeClass,
          schoolName: schoolFor(branchCode, unit, unitOrdinal), grade: gradeFor(unit, unitOrdinal),
          teacherName, unitName: canonicalUnit,
          motherPhone: phones.mother, fatherPhone: phones.father,
          classResolutionStatus: scienceOnly ? "SCIENCE_ONLY" : "ONE_REGULAR",
          classResolutionReason: null, assignments,
        });
        localOrdinal += 1;
      }
    }
    // 단위 미판정 수학 반 학생
    for (let ordinal = 0; ordinal < plan.unresolvedMath; ordinal += 1) {
      globalOrdinal += 1;
      const key = `${branchCode}-${String(localOrdinal + 1).padStart(4, "0")}`;
      const className = `A수학${String(ordinal + 1).padStart(2, "0")}`;
      const teacherName = teacherFor(globalOrdinal);
      const assignments: QaAssignmentDraft[] = [{ key: `${key}-A01`, className, teacherName, unitName: null }];
      if (ordinal < (plan.mathScience.UNRESOLVED ?? 0)) {
        assignments.push({ key: `${key}-A02`, className: scienceClassName(branchCode, ordinal), teacherName: null, unitName: "과학" });
      }
      const phones = phonesFor(branchIndex, localOrdinal, plan.siblingPairs);
      students.push({
        key, publicId: stableQaUuid("student", key),
        sourceStudentNo: `QA-${branchCode.slice(0, 2)}-${String(localOrdinal + 1).padStart(6, "0")}`,
        branchCode, name: `QA학생${String(globalOrdinal).padStart(4, "0")}`,
        className, schoolName: schoolFor(branchCode, "HIGH", ordinal), grade: "고등부",
        teacherName, unitName: null, motherPhone: phones.mother, fatherPhone: phones.father,
        classResolutionStatus: "ONE_REGULAR", classResolutionReason: null, assignments,
      });
      localOrdinal += 1;
    }
    // 반 없는 학생
    for (let ordinal = 0; ordinal < plan.noClass; ordinal += 1) {
      globalOrdinal += 1;
      const key = `${branchCode}-${String(localOrdinal + 1).padStart(4, "0")}`;
      const phones = phonesFor(branchIndex, localOrdinal, plan.siblingPairs);
      students.push({
        key, publicId: stableQaUuid("student", key),
        sourceStudentNo: `QA-${branchCode.slice(0, 2)}-${String(localOrdinal + 1).padStart(6, "0")}`,
        branchCode, name: `QA학생${String(globalOrdinal).padStart(4, "0")}`,
        className: "미분류", schoolName: schoolFor(branchCode, "ELEMENTARY", ordinal), grade: "미분류",
        teacherName: null, unitName: null, motherPhone: phones.mother, fatherPhone: phones.father,
        classResolutionStatus: "AMBIGUOUS_FALLBACK", classResolutionReason: "NO_CLASS", assignments: [],
      });
      localOrdinal += 1;
    }
    if (localOrdinal !== QA_BRANCH_STUDENT_COUNTS[branchCode]) {
      throw new Error(`QA branch count mismatch for ${branchCode}: ${localOrdinal}`);
    }
  }

  // 정규 반 여러 개(판정 불가) 학생 1명
  const multipleRegular = students.find((student) => student.branchCode === "CAMPUS_A"
    && student.unitName === "초등" && student.assignments.length === 1);
  if (multipleRegular === undefined) throw new Error("Multiple regular fixture is missing");
  (multipleRegular.assignments as QaAssignmentDraft[]).push({
    key: `${multipleRegular.key}-A02`, className: "5M2B",
    teacherName: multipleRegular.teacherName, unitName: "초등",
  });
  (multipleRegular as Mutable<QaStudentDraft>).classResolutionStatus = "AMBIGUOUS_FALLBACK";
  (multipleRegular as Mutable<QaStudentDraft>).classResolutionReason = "MULTIPLE_REGULAR";

  // 대표 반이 아닌 추가 등록(기하[시간]·특강): 29명은 1개, 54명은 2개
  const singleAssignmentCandidates = students.filter((student) => student.assignments.length === 1
    && student.classResolutionStatus === "ONE_REGULAR");
  const extraTargets = singleAssignmentCandidates.slice(0, 83);
  for (const [index, student] of extraTargets.entries()) {
    const extras = index < 29 ? 1 : 2;
    for (let extra = 0; extra < extras; extra += 1) {
      (student.assignments as QaAssignmentDraft[]).push({
        key: `${student.key}-N${extra + 1}`,
        className: extra === 0 ? "기하[일1]" : "수학특강",
        teacherName: student.teacherName, unitName: student.unitName,
      });
    }
  }
  return students;
}

/**
 * readonly 제거 타입. 계획 조립 중 판정 결과 수정용
 */
type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };

/**
 * 설명회 초안 4건
 */
function buildSeminars(): QaSeminarDraft[] {
  return [
    ["ADMISSION", "2026 대학교 입시 설명회", "PUBLISHED"],
    ["CAMPUS_A_STRATEGY", "2026 A 학부모 전략 설명회", "PUBLISHED"],
    ["CAMPUS_B_STRATEGY", "2026 B 학부모 전략 설명회", "PUBLISHED"],
    ["CAMPUS_C_STRATEGY", "2026 C 학부모 전략 설명회", "PUBLISHED"],
  ].map(([key, title, status]) => ({
    key: key!, publicId: stableQaUuid("seminar", key!), title: title!, status: status as "PUBLISHED",
  }));
}

/**
 * 회차 초안 6건. 회차 길이 2시간, 예약은 시작 30일 전부터 시작 시각까지
 */
function buildSessions(): QaSessionDraft[] {
  const session = (
    key: string, seminarKey: string, title: string, place: string, startsAt: string,
    status: "OPEN" | "CLOSED", branchCode: QaBranchCode | null,
    guestBookingEnabled: boolean,
  ): QaSessionDraft => {
    const start = new Date(startsAt);
    return {
      key, publicId: stableQaUuid("session", key), seminarKey,
      scope: branchCode === null ? "ALL" : "BRANCH", branchCode, title, place,
      startsAt: start, endsAt: new Date(start.getTime() + 2 * 60 * 60 * 1_000),
      bookingOpensAt: new Date(start.getTime() - 30 * 24 * 60 * 60 * 1_000),
      bookingClosesAt: start, guestBookingEnabled, status,
    };
  };
  return [
    session("POC", "ADMISSION", "2026 대학교 입시 설명회 · 1회차", "서울시 교통회관 (올림픽로 319)", "2026-08-21T11:00:00+09:00", "OPEN", null, true),
    session("LOAD", "ADMISSION", "합성 부하·통계 검증 회차", "QA 통합 테스트홀", "2026-06-20T11:00:00+09:00", "CLOSED", null, false),
    session("CAMPUS_A", "CAMPUS_A_STRATEGY", "A 학부모 전략 설명회", "A QA홀", "2026-09-05T11:00:00+09:00", "OPEN", "CAMPUS_A", false),
    session("CAMPUS_B", "CAMPUS_B_STRATEGY", "B 학부모 전략 설명회", "B QA홀", "2026-09-12T11:00:00+09:00", "OPEN", "CAMPUS_B", false),
    session("CAMPUS_C", "CAMPUS_C_STRATEGY", "C 학부모 전략 설명회", "C QA홀", "2026-09-19T11:00:00+09:00", "OPEN", "CAMPUS_C", false),
    session("HISTORY", "CAMPUS_C_STRATEGY", "과거 만족도 회귀 회차", "C QA홀", "2026-05-16T11:00:00+09:00", "CLOSED", "CAMPUS_C", false),
  ];
}

/**
 * 예약 초안 생성
 *
 * POC 회차 17건(예약 10·입장 5·취소 2, 마지막 2건은 비재원생), 부하 회차 1,500건(예약 900·입장 300·취소 150·미참석 150)
 * 가족은 연락처가 겹치지 않게 골라 한 연락처가 한 회차에 한 번만 예약
 */
function buildBookings(students: readonly QaStudentDraft[]): QaBookingDraft[] {
  const bookings: QaBookingDraft[] = [];
  const seenContacts = new Set<string>();
  const families = familyGroups(students).filter((family) => {
    const contact = family[0]!.motherPhone;
    if (seenContacts.has(contact)) return false;
    seenContacts.add(contact);
    return true;
  });
  const pocStatuses: readonly QaBookingStatus[] = [
    ...Array<QaBookingStatus>(10).fill("RESERVED"),
    ...Array<QaBookingStatus>(5).fill("CHECKED_IN"),
    ...Array<QaBookingStatus>(2).fill("CANCELLED"),
  ];
  for (let index = 0; index < pocStatuses.length; index += 1) {
    const guest = index >= 15 ? { branchCode: index === 15 ? "CAMPUS_B" as const : "CAMPUS_C" as const, ordinal: index - 14 } : null;
    const family = families[index]!;
    bookings.push(booking(`POC-${index + 1}`, "POC", guest === null ? family.map((student) => student.key) : [], guest,
      guest === null ? family[0]!.motherPhone : `0108800${String(index).padStart(4, "0")}`,
      pocStatuses[index]!, index, new Date(`2026-07-${String(1 + index).padStart(2, "0")}T01:00:00Z`)));
  }
  const loadStatuses: readonly QaBookingStatus[] = [
    ...Array<QaBookingStatus>(900).fill("RESERVED"),
    ...Array<QaBookingStatus>(300).fill("CHECKED_IN"),
    ...Array<QaBookingStatus>(150).fill("CANCELLED"),
    ...Array<QaBookingStatus>(150).fill("NO_SHOW"),
  ];
  for (let index = 0; index < loadStatuses.length; index += 1) {
    const family = families[index]!;
    bookings.push(booking(`LOAD-${index + 1}`, "LOAD", family.map((student) => student.key), null,
      family[0]!.motherPhone, loadStatuses[index]!, index,
      new Date(2026, 4, 1 + (index % 30), 9 + (index % 8), index % 60)));
  }
  return bookings;
}

/**
 * 예약 초안 1건. 순번으로 참석 보호자·예약 경로를 순환 배정
 */
function booking(
  key: string, sessionKey: string, studentKeys: readonly string[],
  guest: QaBookingDraft["guest"], contactPhone: string, status: QaBookingStatus,
  index: number, createdAt: Date,
): QaBookingDraft {
  const party = (["MOTHER", "FATHER", "BOTH"] as const)[index % 3]!;
  return {
    key, publicId: stableQaUuid("booking", key), sessionKey, studentKeys, guest,
    contactPhone, attendanceParty: party, seatCount: party === "BOTH" ? 2 : 1,
    status, bookingSource: (["WEB_APP", "PHONE", "TEACHER", "ON_SITE"] as const)[index % 4]!, createdAt,
  };
}

/**
 * 지점·어머니 연락처가 같은 학생을 가족으로 묶음. 첫 학생 키 순
 */
function familyGroups(students: readonly QaStudentDraft[]): QaStudentDraft[][] {
  const groups = new Map<string, QaStudentDraft[]>();
  for (const student of students) {
    const key = `${student.branchCode}:${student.motherPhone}`;
    const current = groups.get(key) ?? [];
    current.push(student);
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => left[0]!.key.localeCompare(right[0]!.key));
}

/**
 * 학생 순번별 보호자 연락처
 *
 * 각 지점 처음 2명은 공통 번호, 이후 siblingPairs 가족은 2명씩 같은 번호, 나머지는 1명씩
 */
function phonesFor(branchIndex: number, localOrdinal: number, siblingPairs: number): { mother: string; father: string } {
  if (localOrdinal < 2) return { mother: "01099000001", father: "01099000002" };
  const adjusted = localOrdinal - 2;
  const localFamily = adjusted < siblingPairs * 2
    ? Math.floor(adjusted / 2)
    : siblingPairs + adjusted - siblingPairs * 2;
  const family = branchIndex * 10_000 + localFamily + 1;
  return {
    mother: `010${String(10_000_000 + family).slice(-8)}`,
    father: `010${String(20_000_000 + family).slice(-8)}`,
  };
}

/**
 * 단위별 수학 반 이름 순환 선택
 */
function mathClassName(unit: Exclude<QaUnitGroup, "SCIENCE">, ordinal: number): string {
  const patterns: Readonly<Record<Exclude<QaUnitGroup, "SCIENCE">, readonly string[]>> = {
    ELEMENTARY: ["4M1A", "5ZMA", "6T3C", "초3A"],
    MIDDLE_1: ["1M1B", "1T2A", "1M2B"],
    MIDDLE_2: ["2M2E", "2T3B", "2M3C"],
    MIDDLE_3: ["3T3C", "3M3A", "3T2B"],
    SPECIAL_PURPOSE: ["중1SKYM3", "중2SKY2", "중3특목A", "초6특1", "예1S"],
    HIGH: ["고1A", "고2HS", "고3이과M"],
  };
  return patterns[unit][ordinal % patterns[unit].length]!;
}

/**
 * 지점별 과학 반 이름(시간표 접미사 포함) 순환 선택
 */
function scienceClassName(branch: QaBranchCode, ordinal: number): string {
  const patterns: Readonly<Record<QaBranchCode, readonly string[]>> = {
    CAMPUS_A: ["과1특A[토3]", "과2내신[토10]", "과고1가람[일4]", "과고2화학SKY[일4]"],
    CAMPUS_B: ["과고3생2[화2]", "과고2역학SKY[일5]", "과1특S[E3]", "과2내신[토10]"],
    CAMPUS_C: ["과2내신[토10]", "과고1가람[일4]", "과고2세포와물질대사[토7]", "과3광남내신[토1]"],
  };
  return patterns[branch][ordinal % patterns[branch].length]!;
}

/**
 * 담임 이름. 17번째마다 부담임을 쉼표로 추가
 */
function teacherFor(ordinal: number): string {
  const primary = `QA담임${String((ordinal % 36) + 1).padStart(2, "0")}`;
  return ordinal % 17 === 0 ? `${primary},QA부담임${String((ordinal % 12) + 1).padStart(2, "0")}` : primary;
}

/**
 * 지점·단위별 학교 이름
 */
function schoolFor(branch: QaBranchCode, unit: QaUnitGroup, ordinal: number): string {
  const suffix = unit === "ELEMENTARY" ? "초" : unit.startsWith("MIDDLE") || unit === "SPECIAL_PURPOSE" ? "중" : "고";
  const names: Readonly<Record<QaBranchCode, readonly string[]>> = {
    CAMPUS_A: ["QA가동", "QA가곡", "QA잠실", "QA석촌"],
    CAMPUS_B: ["QAB", "QA성남", "QA창곡", "QA복정"],
    CAMPUS_C: ["QAC", "QA구남", "QA화양", "QA자양"],
  };
  return `${names[branch][ordinal % names[branch].length]}${suffix}`;
}

/**
 * 단위별 학년 표시
 */
function gradeFor(unit: QaUnitGroup, ordinal: number): string {
  switch (unit) {
    case "ELEMENTARY": return `${4 + (ordinal % 3)}학년`;
    case "MIDDLE_1": return "1학년";
    case "MIDDLE_2": return "2학년";
    case "MIDDLE_3": return "3학년";
    case "SPECIAL_PURPOSE": return `${1 + (ordinal % 3)}학년`;
    case "HIGH": return `${1 + (ordinal % 3)}학년`;
    case "SCIENCE": return `${1 + (ordinal % 3)}학년`;
  }
}

/**
 * 계획 건수와 수강 등록 반 형식 검증
 *
 * @throws {Error} 건수 불일치, 허용되지 않은 반, 과학 반의 단위 누락
 */
function assertPlan(
  students: readonly QaStudentDraft[], seminars: readonly QaSeminarDraft[], sessions: readonly QaSessionDraft[],
  bookings: readonly QaBookingDraft[],
): void {
  const assignments = students.reduce((count, student) => count + student.assignments.length, 0);
  const multiple = students.filter((student) => student.assignments.length > 1).length;
  const counts = {
    students: students.length, assignments, multiAssignmentStudents: multiple,
    seminars: seminars.length, sessions: sessions.length,
    pocBookings: bookings.filter((row) => row.sessionKey === "POC").length,
    loadBookings: bookings.filter((row) => row.sessionKey === "LOAD").length,
  };
  for (const [name, actual] of Object.entries(counts)) {
    const expected = EXPECTED_QA_COUNTS[name as keyof typeof EXPECTED_QA_COUNTS];
    if (actual !== expected) throw new Error(`Synthetic QA ${name} mismatch: expected ${expected}, received ${actual}`);
  }
  for (const student of students) {
    for (const assignment of student.assignments) {
      if (assignment.className === "" || (!isRepresentativeStudentClass(assignment.className)
        && !["기하[일1]", "수학특강"].includes(assignment.className))) {
        throw new Error(`Unexpected QA assignment class: ${assignment.className}`);
      }
      if (isScienceStudentClass(assignment.className) && assignment.unitName !== "과학") {
        throw new Error(`Science QA assignment is missing its unit: ${assignment.className}`);
      }
    }
  }
}
