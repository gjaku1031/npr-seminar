import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { canonicalUnitName, primaryTeacher } from "./student-display-normalizer.js";
import {
  classifyStudentAssignment,
  isFutureTermStudentClass,
  isRepresentativeStudentClass,
  isScienceStudentClass,
  studentClassBaseName,
} from "./student-classification.js";
import type { BranchCode, StagedSnapshotRow } from "./offline-snapshot.types.js";
import type { TongBranchSnapshot, TongSourceAssignment } from "./tongtontong.gateway.js";

export interface LiveSyncConflict {
  readonly type: "DUPLICATE_STUDENT_ASSIGNMENT_KEY" | "STUDENT_IDENTITY_MISMATCH" | "CROSS_BRANCH_STUDENT_NO";
  readonly branch: BranchCode | null;
  readonly sourceStudentNo: string;
  readonly sourceAssignmentKeyDigest: string | null;
  readonly detail: string;
}

export interface LiveSyncCounts {
  readonly fetchedAssignmentCount: number;
  readonly bracketExcludedAssignmentCount: number;
  readonly includedAssignmentCount: number;
  readonly uniqueStudentCount: number;
  readonly multiAssignmentStudentCount: number;
  readonly regularRepresentativeCount: number;
  readonly scienceAliasRepresentativeCount: number;
  readonly multipleRegularAmbiguousCount: number;
  readonly noClassAmbiguousCount: number;
  readonly ambiguousStudentCount: number;
  readonly insertedStudentCount: number;
  readonly updatedStudentCount: number;
  readonly inactivatedStudentCount: number;
  readonly insertedAssignmentCount: number;
  readonly updatedAssignmentCount: number;
  readonly inactivatedAssignmentCount: number;
}

export interface NormalizedLiveSnapshot {
  readonly rows: readonly StagedSnapshotRow[];
  readonly conflicts: readonly LiveSyncConflict[];
  readonly counts: LiveSyncCounts;
  readonly branchCounts: Readonly<Record<BranchCode, LiveSyncCounts>>;
  readonly snapshotHash: Buffer;
  readonly stagingHash: Buffer;
}

const BRANCH_ORDER: readonly BranchCode[] = ["SONGPA", "WIRYE", "GWANGJIN"];
type MutableRow = Omit<StagedSnapshotRow, "primaryCandidate" | "primarySelected" | "classResolutionStatus" | "classResolutionReason">;

@Injectable()
export class StudentNormalizerService {
  public constructor(private readonly phoneProtector: PhoneProtector) {}

  public normalize(snapshots: readonly TongBranchSnapshot[]): NormalizedLiveSnapshot {
    if (snapshots.length !== BRANCH_ORDER.length || snapshots.some((snapshot, index) => snapshot.branch !== BRANCH_ORDER[index])) {
      this.fail("TONG_BRANCH_ORDER_INVALID");
    }
    if (snapshots.some((snapshot) => snapshot.assignments.length === 0)) this.fail("TONG_EMPTY_SNAPSHOT");
    const mutable: MutableRow[] = [];
    let ordinal = 0;
    for (const snapshot of snapshots) {
      for (const source of snapshot.assignments) {
        ordinal += 1;
        mutable.push(this.row(snapshot.branch, ordinal, source));
      }
    }
    if (BRANCH_ORDER.some((branch) => !mutable.some((row) => row.branchCode === branch && row.included))) {
      this.fail("TONG_EMPTY_ACTIVE_SNAPSHOT");
    }

    const conflicts = this.conflicts(mutable);
    const groups = new Map<string, MutableRow[]>();
    for (const row of mutable.filter((candidate) => candidate.included)) {
      const assignments = groups.get(row.sourceStudentNo) ?? [];
      assignments.push(row); groups.set(row.sourceStudentNo, assignments);
    }
    const selections = new Map<string, {
      readonly selectedOrdinal: number;
      readonly status: Exclude<StagedSnapshotRow["classResolutionStatus"], null>;
      readonly reason: StagedSnapshotRow["classResolutionReason"];
    }>();
    for (const [studentNo, assignments] of groups) {
      const uniqueCandidates = new Map<string, MutableRow>();
      for (const assignment of [...assignments].filter((row) => isRepresentativeStudentClass(row.className)).sort(this.assignmentOrder)) {
        const key = studentClassBaseName(assignment.className);
        if (!uniqueCandidates.has(key)) uniqueCandidates.set(key, assignment);
      }
      const candidates = [...uniqueCandidates.values()];
      const regular = candidates.filter((row) => !isScienceStudentClass(row.className));
      const science = candidates.filter((row) => isScienceStudentClass(row.className));
      const pool = regular.length > 0 ? regular : science.length > 0 ? science : assignments;
      const selected = [...pool].sort(this.assignmentOrder)[0]!;
      if (regular.length === 1) selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "ONE_REGULAR", reason: null });
      else if (regular.length === 0 && science.length > 0) selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "SCIENCE_ONLY", reason: null });
      else if (regular.length > 1) selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "MULTIPLE_REGULAR" });
      // 다음 학기 반만 가진 학생과 아예 반이 없는 학생을 구분한다. 전자는 방금 등록해
      // 개강 전인 재원생이고, 그 사실을 '미분류'로 뭉뚱그리면 원인을 다시 찾게 된다.
      else if (assignments.some((row) => isFutureTermStudentClass(row.className))) {
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "FUTURE_TERM_ONLY" });
      }
      else selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "NO_CLASS" });
    }
    const rows: StagedSnapshotRow[] = mutable.map((row) => {
      const selection = row.included ? selections.get(row.sourceStudentNo) : undefined;
      return {
        ...row,
        primaryCandidate: row.included && isRepresentativeStudentClass(row.className),
        primarySelected: selection?.selectedOrdinal === row.sourceOrdinal,
        classResolutionStatus: row.included ? selection?.status ?? null : null,
        classResolutionReason: row.included ? selection?.reason ?? null : null,
      };
    });
    const zeroMutations = { insertedStudentCount: 0, updatedStudentCount: 0, inactivatedStudentCount: 0,
      insertedAssignmentCount: 0, updatedAssignmentCount: 0, inactivatedAssignmentCount: 0 };
    const counts = { ...this.counts(rows), ...zeroMutations };
    const branchCounts = Object.fromEntries(BRANCH_ORDER.map((branch) => [branch, {
      ...this.counts(rows.filter((row) => row.branchCode === branch)), ...zeroMutations,
    }])) as Readonly<Record<BranchCode, LiveSyncCounts>>;
    return {
      rows, conflicts, counts, branchCounts,
      snapshotHash: createHash("sha256").update(snapshots.map((snapshot) => `${snapshot.branch}:${snapshot.snapshotHash.toString("base64url")}`).join("|")).digest(),
      stagingHash: this.stagingHash(rows),
    };
  }

  private row(branch: BranchCode, ordinal: number, source: TongSourceAssignment): MutableRow {
    if (source.sourceStatus.normalize("NFKC").trim() === "재원생"
      && source.className.normalize("NFKC").trim() === "") {
      this.fail("TONG_CLASS_NAME_MISSING");
    }
    const { included, exclusionReason } = classifyStudentAssignment(source.sourceStatus, source.className);
    const required = (value: string, code: string): string => {
      const normalized = value.normalize("NFKC").trim();
      if (included && normalized === "") this.fail(code);
      return normalized;
    };
    const studentNo = required(source.studentNo, "TONG_STUDENT_NO_MISSING") || `excluded:${ordinal}`;
    const sourceUniqueNo = required(source.sourceUniqueNo, "TONG_SOURCE_UNIQUE_NO_MISSING") || `excluded:${ordinal}`;
    const classRegistrationNo = required(source.classRegistrationNo, "TONG_CLASS_REGISTRATION_NO_MISSING") || `excluded:${ordinal}`;
    const className = required(source.className, "TONG_CLASS_NAME_MISSING") || "excluded";
    const name = required(source.name, "TONG_STUDENT_NAME_MISSING") || "excluded";
    let phone: ReturnType<PhoneProtector["protect"]> | null = null;
    if (included && source.motherPhone.trim() !== "") phone = this.phoneProtector.protect(source.motherPhone);
    const fatherPhoneObserved = source.fatherPhone !== undefined;
    let fatherPhone: ReturnType<PhoneProtector["protect"]> | null = null;
    if (included && fatherPhoneObserved && source.fatherPhone!.trim() !== "") {
      fatherPhone = this.phoneProtector.protect(source.fatherPhone!);
    }
    const optional = (value: string): string | null => {
      const normalized = value.normalize("NFKC").trim(); return normalized === "" ? null : normalized;
    };
    const canonical = included ? [branch, studentNo, sourceUniqueNo, classRegistrationNo, name, className, source.schoolName, source.grade,
      source.teacherName, source.unitName, source.sourceStatus, phone?.digest.toString("base64") ?? "",
      fatherPhoneObserved ? fatherPhone?.digest.toString("base64") ?? "OBSERVED_EMPTY" : "NOT_OBSERVED",
    ].map((value) => value.normalize("NFKC").trim()).join("\u0000")
      : [branch, ordinal.toString(), exclusionReason ?? "EXCLUDED"].join("\u0000");
    return {
      branchCode: branch, sourceOrdinal: ordinal, sourceUniqueNo, classRegistrationNo,
      sourceStudentNo: studentNo, name, className, schoolName: optional(source.schoolName), grade: optional(source.grade),
      teacherName: primaryTeacher(source.teacherName), unitName: canonicalUnitName(className),
      motherPhoneCiphertext: phone?.ciphertext ?? null, motherPhoneDigest: phone?.digest ?? null,
      motherPhoneLast4: phone?.last4 ?? null,
      fatherPhoneCiphertext: fatherPhone?.ciphertext ?? null, fatherPhoneDigest: fatherPhone?.digest ?? null,
      fatherPhoneLast4: fatherPhone?.last4 ?? null, fatherPhoneObserved,
      sourceStatus: source.sourceStatus.normalize("NFKC").trim(), rowHash: createHash("sha256").update(canonical).digest(),
      included, exclusionReason,
    };
  }

  private conflicts(rows: readonly MutableRow[]): LiveSyncConflict[] {
    const result: LiveSyncConflict[] = [];
    const assignmentKeys = new Set<string>();
    const students = new Map<string, MutableRow[]>();
    for (const row of rows.filter((candidate) => candidate.included)) {
      const assignmentKey = `${row.branchCode}\u0000${row.sourceStudentNo}\u0000${row.sourceUniqueNo}\u0000${row.classRegistrationNo}`;
      if (assignmentKeys.has(assignmentKey)) result.push({
        type: "DUPLICATE_STUDENT_ASSIGNMENT_KEY", branch: row.branchCode, sourceStudentNo: row.sourceStudentNo,
        sourceAssignmentKeyDigest: createHash("sha256")
          .update(`${row.sourceUniqueNo}\u0000${row.classRegistrationNo}`).digest("base64url"),
        detail: "The same student and source assignment key appeared more than once in a branch snapshot.",
      });
      assignmentKeys.add(assignmentKey);
      const assignments = students.get(row.sourceStudentNo) ?? []; assignments.push(row); students.set(row.sourceStudentNo, assignments);
    }
    for (const [studentNo, assignments] of students) {
      const branches = new Set(assignments.map((row) => row.branchCode));
      if (branches.size > 1) result.push({
        type: "CROSS_BRANCH_STUDENT_NO", branch: null, sourceStudentNo: studentNo, sourceAssignmentKeyDigest: null,
        detail: "The globally unique student number appeared in more than one branch snapshot.",
      });
      const first = assignments[0]!;
      const identity = (row: MutableRow) => [row.name, row.schoolName ?? "", row.grade ?? "", row.motherPhoneDigest?.toString("base64") ?? ""].join("\u0000");
      if (assignments.some((row) => identity(row) !== identity(first))) result.push({
        type: "STUDENT_IDENTITY_MISMATCH", branch: branches.size === 1 ? first.branchCode : null,
        sourceStudentNo: studentNo, sourceAssignmentKeyDigest: null,
        detail: "Assignments for one student number disagree on identity fields.",
      });
    }
    return result;
  }

  private counts(rows: readonly StagedSnapshotRow[]): Omit<LiveSyncCounts,
    "insertedStudentCount" | "updatedStudentCount" | "inactivatedStudentCount" |
    "insertedAssignmentCount" | "updatedAssignmentCount" | "inactivatedAssignmentCount"> {
    const included = rows.filter((row) => row.included);
    const selected = rows.filter((row) => row.primarySelected);
    const groups = new Map<string, number>();
    for (const row of included) groups.set(row.sourceStudentNo, (groups.get(row.sourceStudentNo) ?? 0) + 1);
    return {
      fetchedAssignmentCount: rows.length,
      bracketExcludedAssignmentCount: rows.filter((row) => row.exclusionReason === "BRACKETED_CLASS").length,
      includedAssignmentCount: included.length,
      uniqueStudentCount: groups.size,
      multiAssignmentStudentCount: [...groups.values()].filter((count) => count > 1).length,
      regularRepresentativeCount: selected.filter((row) => row.classResolutionStatus === "ONE_REGULAR").length,
      scienceAliasRepresentativeCount: selected.filter((row) => row.classResolutionStatus === "SCIENCE_ONLY").length,
      multipleRegularAmbiguousCount: selected.filter((row) => row.classResolutionReason === "MULTIPLE_REGULAR").length,
      noClassAmbiguousCount: selected.filter((row) => row.classResolutionReason === "NO_CLASS").length,
      ambiguousStudentCount: selected.filter((row) => row.classResolutionReason !== null).length,
    };
  }

  private stagingHash(rows: readonly StagedSnapshotRow[]): Buffer {
    const hash = createHash("sha256");
    for (const row of rows) hash.update(`${row.sourceOrdinal}\u0000${row.rowHash.toString("base64url")}\u0000${Number(row.included)}\u0000${Number(row.primarySelected)}\n`);
    return hash.digest();
  }
  private readonly assignmentOrder = (left: MutableRow, right: MutableRow): number => left.className.localeCompare(right.className, "ko")
    || left.sourceUniqueNo.localeCompare(right.sourceUniqueNo)
    || left.classRegistrationNo.localeCompare(right.classRegistrationNo) || left.sourceOrdinal - right.sourceOrdinal;
  private fail(code: string): never { throw new DomainError(422, code, "The live student snapshot failed validation."); }
}
