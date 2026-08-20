import { createHash } from "node:crypto";
import { canonicalUnitName } from "../modules/student-sync/student-display-normalizer.js";
import {
  isRepresentativeStudentClass,
  isScienceStudentClass,
} from "../modules/student-sync/student-classification.js";

export type QaBranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";
export type QaUnitGroup = "ELEMENTARY" | "MIDDLE_1" | "MIDDLE_2" | "MIDDLE_3" | "SPECIAL_PURPOSE" | "HIGH" | "SCIENCE";
export type QaBookingStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

export const EXPECTED_QA_COUNTS = {
  students: 3_382,
  assignments: 3_805,
  multiAssignmentStudents: 372,
  seminars: 4,
  sessions: 6,
  pocBookings: 17,
  loadBookings: 1_500,
  scanners: 6,
} as const;

export const QA_BRANCH_STUDENT_COUNTS: Readonly<Record<QaBranchCode, number>> = {
  CAMPUS_A: 1_739,
  CAMPUS_B: 795,
  CAMPUS_C: 848,
};

export interface QaAssignmentDraft {
  readonly key: string;
  readonly className: string;
  readonly teacherName: string | null;
  readonly unitName: string | null;
}

export interface QaStudentDraft {
  readonly key: string;
  readonly publicId: string;
  readonly sourceStudentNo: string;
  readonly branchCode: QaBranchCode;
  readonly name: string;
  readonly className: string;
  readonly schoolName: string;
  readonly grade: string;
  readonly teacherName: string | null;
  readonly unitName: string | null;
  readonly motherPhone: string;
  readonly fatherPhone: string;
  readonly classResolutionStatus: "ONE_REGULAR" | "SCIENCE_ONLY" | "AMBIGUOUS_FALLBACK";
  readonly classResolutionReason: "MULTIPLE_REGULAR" | "NO_CLASS" | null;
  readonly assignments: QaAssignmentDraft[];
}

export interface QaSeminarDraft {
  readonly key: string;
  readonly publicId: string;
  readonly title: string;
  readonly status: "PUBLISHED" | "ARCHIVED";
}

export interface QaSessionDraft {
  readonly key: string;
  readonly publicId: string;
  readonly seminarKey: string;
  readonly scope: "ALL" | "BRANCH";
  readonly branchCode: QaBranchCode | null;
  readonly title: string;
  readonly place: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly bookingOpensAt: Date;
  readonly bookingClosesAt: Date;
  readonly guestBookingEnabled: boolean;
  readonly status: "OPEN" | "CLOSED";
}

export interface QaBookingDraft {
  readonly key: string;
  readonly publicId: string;
  readonly sessionKey: string;
  readonly studentKeys: readonly string[];
  readonly guest: { readonly branchCode: QaBranchCode; readonly ordinal: number } | null;
  readonly contactPhone: string;
  readonly attendanceParty: "MOTHER" | "FATHER" | "BOTH";
  readonly seatCount: 1 | 2;
  readonly status: QaBookingStatus;
  readonly bookingSource: "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";
  readonly createdAt: Date;
}

export interface SyntheticQaPlan {
  readonly students: readonly QaStudentDraft[];
  readonly seminars: readonly QaSeminarDraft[];
  readonly sessions: readonly QaSessionDraft[];
  readonly bookings: readonly QaBookingDraft[];
}

interface BranchPlan {
  readonly units: Readonly<Record<QaUnitGroup, number>>;
  readonly mathScience: Partial<Readonly<Record<QaUnitGroup | "UNRESOLVED", number>>>;
  readonly noClass: number;
  readonly unresolvedMath: number;
  readonly siblingPairs: number;
}

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

const BRANCHES: readonly QaBranchCode[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];
const UNITS: readonly QaUnitGroup[] = ["ELEMENTARY", "MIDDLE_1", "MIDDLE_2", "MIDDLE_3", "SPECIAL_PURPOSE", "HIGH", "SCIENCE"];

export function stableQaUuid(kind: string, key: string): string {
  const bytes = createHash("sha256").update(`npr:synthetic-qa:v1:${kind}:${key}`).digest().subarray(0, 16);
  // Runtime routes validate every public identifier as UUID v4.  The QA seed
  // remains reproducible, but its deterministic bytes must still advertise
  // the same RFC 4122 version/variant as production-generated identifiers.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function stableQaDigest(value: string): Uint8Array<ArrayBuffer> {
  const digest = createHash("sha256").update(`npr:synthetic-qa:v1:${value}`).digest();
  const copy = new Uint8Array(new ArrayBuffer(digest.byteLength));
  copy.set(digest);
  return copy;
}

export function buildSyntheticQaPlan(): SyntheticQaPlan {
  const students = buildStudents();
  const seminars = buildSeminars();
  const sessions = buildSessions();
  const bookings = buildBookings(students);
  assertPlan(students, seminars, sessions, bookings);
  return { students, seminars, sessions, bookings };
}

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

  const multipleRegular = students.find((student) => student.branchCode === "CAMPUS_A"
    && student.unitName === "초등" && student.assignments.length === 1);
  if (multipleRegular === undefined) throw new Error("Multiple regular fixture is missing");
  (multipleRegular.assignments as QaAssignmentDraft[]).push({
    key: `${multipleRegular.key}-A02`, className: "5M2B",
    teacherName: multipleRegular.teacherName, unitName: "초등",
  });
  (multipleRegular as Mutable<QaStudentDraft>).classResolutionStatus = "AMBIGUOUS_FALLBACK";
  (multipleRegular as Mutable<QaStudentDraft>).classResolutionReason = "MULTIPLE_REGULAR";

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

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };

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

function scienceClassName(branch: QaBranchCode, ordinal: number): string {
  const patterns: Readonly<Record<QaBranchCode, readonly string[]>> = {
    CAMPUS_A: ["과1특A[토3]", "과2내신[토10]", "과고1가람[일4]", "과고2화학SKY[일4]"],
    CAMPUS_B: ["과고3생2[화2]", "과고2역학SKY[일5]", "과1특S[E3]", "과2내신[토10]"],
    CAMPUS_C: ["과2내신[토10]", "과고1가람[일4]", "과고2세포와물질대사[토7]", "과3광남내신[토1]"],
  };
  return patterns[branch][ordinal % patterns[branch].length]!;
}

function teacherFor(ordinal: number): string {
  const primary = `QA담임${String((ordinal % 36) + 1).padStart(2, "0")}`;
  return ordinal % 17 === 0 ? `${primary},QA부담임${String((ordinal % 12) + 1).padStart(2, "0")}` : primary;
}

function schoolFor(branch: QaBranchCode, unit: QaUnitGroup, ordinal: number): string {
  const suffix = unit === "ELEMENTARY" ? "초" : unit.startsWith("MIDDLE") || unit === "SPECIAL_PURPOSE" ? "중" : "고";
  const names: Readonly<Record<QaBranchCode, readonly string[]>> = {
    CAMPUS_A: ["QA가동", "QA가곡", "QA잠실", "QA석촌"],
    CAMPUS_B: ["QAB", "QA성남", "QA창곡", "QA복정"],
    CAMPUS_C: ["QAC", "QA구남", "QA화양", "QA자양"],
  };
  return `${names[branch][ordinal % names[branch].length]}${suffix}`;
}

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
