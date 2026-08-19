import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import {
  type BranchCode,
  type ParsedOfflineSnapshot,
  type SnapshotSafeSummary,
  type SnapshotSourceRow,
  type StagedSnapshotRow,
} from "./offline-snapshot.types.js";
import { canonicalUnitName, primaryTeacher } from "./student-display-normalizer.js";
import {
  classifyStudentAssignment,
  isFutureTermStudentClass,
  isRepresentativeStudentClass,
  isScienceStudentClass,
  studentClassBaseName,
} from "./student-classification.js";

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const BRANCHES: readonly BranchCode[] = ["SONGPA", "WIRYE", "GWANGJIN"];
const SOURCE_FILES: Readonly<Record<BranchCode, { file: string; sourceCode: string; raw: number; students: number; assignments: number }>> = {
  SONGPA: { file: "SE8A.json", sourceCode: "SE8A", raw: 4752, students: 1735, assignments: 1872 },
  WIRYE: { file: "KG5M.json", sourceCode: "KG5M", raw: 2622, students: 793, assignments: 911 },
  GWANGJIN: { file: "SE9P.json", sourceCode: "SE9P", raw: 2647, students: 849, assignments: 1016 },
};

const rowSchema = z.object({
  branch: z.string(),
  branchCode: z.string(),
  className: z.string(),
  classRegistrationNo: z.string(),
  enrollmentStatus: z.string(),
  gradeName: z.string(),
  motherPhone: z.string(),
  fatherPhone: z.string().optional().default(""),
  name: z.string(),
  registrationStartedOn: z.string(),
  schoolName: z.string(),
  sourceUniqueNo: z.string(),
  studentNo: z.string(),
  teacherName: z.string(),
  unitName: z.string(),
}).strict();

@Injectable()
export class OfflineSnapshotParser {
  public constructor(private readonly phoneProtector: PhoneProtector) {}

  public async parse(suppliedDirectory: string): Promise<ParsedOfflineSnapshot> {
    const directory = await this.safeDirectory(suppliedDirectory);
    const checksums = await this.readChecksums(await this.safeFile(directory, "SHA256SUMS"));
    const rawByBranch = new Map<BranchCode, readonly SnapshotSourceRow[]>();
    const fileHashes: string[] = [];
    for (const branch of BRANCHES) {
      const definition = SOURCE_FILES[branch];
      const file = await this.safeFile(directory, definition.file);
      const content = await readFile(file);
      const digest = createHash("sha256").update(content).digest("hex");
      if (checksums.get(definition.file) !== digest) this.fail("SNAPSHOT_CHECKSUM_MISMATCH");
      const parsed: unknown = JSON.parse(content.toString("utf8"));
      const rows = z.array(rowSchema).parse(parsed);
      if (rows.length !== definition.raw || rows.some((row) => row.branchCode !== definition.sourceCode)) {
        this.fail("SNAPSHOT_BRANCH_CONTENT_MISMATCH");
      }
      rawByBranch.set(branch, rows);
      fileHashes.push(`${definition.file}:${digest}`);
    }
    return this.normalize(directory, rawByBranch, fileHashes);
  }

  private normalize(
    directory: string,
    rawByBranch: ReadonlyMap<BranchCode, readonly SnapshotSourceRow[]>,
    fileHashes: readonly string[],
  ): ParsedOfflineSnapshot {
    const mutable: Array<Omit<StagedSnapshotRow, "primaryCandidate" | "primarySelected" | "classResolutionStatus" | "classResolutionReason">> = [];
    let ordinal = 0;
    for (const branch of BRANCHES) {
      for (const source of rawByBranch.get(branch) ?? []) {
        ordinal += 1;
        const studentNo = this.required(source.studentNo, "SNAPSHOT_STUDENT_NO_MISSING");
        const className = this.required(source.className, "SNAPSHOT_CLASS_NAME_MISSING");
        const { included, exclusionReason } = classifyStudentAssignment(source.enrollmentStatus, className);
        const protectedPhone = !included || source.motherPhone.trim() === "" ? null : this.phoneProtector.protect(source.motherPhone);
        const fatherPhone = source.fatherPhone ?? "";
        const protectedFatherPhone = !included || fatherPhone.trim() === "" ? null : this.phoneProtector.protect(fatherPhone);
        const canonical = included
          ? [
              branch, studentNo, source.name, className, source.schoolName, source.gradeName,
              source.teacherName, source.unitName, source.enrollmentStatus,
              source.sourceUniqueNo, source.classRegistrationNo,
              protectedPhone?.digest.toString("base64") ?? "",
              protectedFatherPhone?.digest.toString("base64") ?? "",
            ].map((value) => value.normalize("NFKC").trim()).join("\u0000")
          : [branch, ordinal.toString(), exclusionReason ?? "EXCLUDED"].join("\u0000");
        mutable.push({
          branchCode: branch,
          sourceOrdinal: ordinal,
          sourceUniqueNo: this.required(source.sourceUniqueNo, "SNAPSHOT_SOURCE_UNIQUE_NO_MISSING"),
          classRegistrationNo: this.required(source.classRegistrationNo, "SNAPSHOT_CLASS_REGISTRATION_NO_MISSING"),
          sourceStudentNo: studentNo,
          name: this.required(source.name, "SNAPSHOT_NAME_MISSING"),
          className,
          schoolName: this.optional(source.schoolName),
          grade: this.optional(source.gradeName),
          teacherName: primaryTeacher(source.teacherName),
          unitName: canonicalUnitName(className),
          motherPhoneCiphertext: protectedPhone?.ciphertext ?? null,
          motherPhoneDigest: protectedPhone?.digest ?? null,
          motherPhoneLast4: protectedPhone?.last4 ?? null,
          fatherPhoneCiphertext: protectedFatherPhone?.ciphertext ?? null,
          fatherPhoneDigest: protectedFatherPhone?.digest ?? null,
          fatherPhoneLast4: protectedFatherPhone?.last4 ?? null,
          fatherPhoneObserved: true,
          sourceStatus: this.required(source.enrollmentStatus, "SNAPSHOT_STATUS_MISSING"),
          rowHash: createHash("sha256").update(canonical).digest(),
          included,
          exclusionReason,
        });
      }
    }

    const groups = new Map<string, typeof mutable>();
    for (const row of mutable.filter((candidate) => candidate.included)) {
      const existing = groups.get(row.sourceStudentNo) ?? [];
      existing.push(row);
      groups.set(row.sourceStudentNo, existing);
    }
    const selections = new Map<string, {
      selectedOrdinal: number;
      status: Exclude<StagedSnapshotRow["classResolutionStatus"], null>;
      reason: StagedSnapshotRow["classResolutionReason"];
    }>();
    for (const [studentNo, assignments] of groups) {
      this.requireConsistentStudent(assignments);
      const representativeCandidates = assignments.filter((assignment) => isRepresentativeStudentClass(assignment.className));
      const uniqueClasses = new Map<string, (typeof assignments)[number]>();
      for (const assignment of [...representativeCandidates].sort(this.assignmentOrder)) {
        const normalizedClass = studentClassBaseName(assignment.className);
        if (!uniqueClasses.has(normalizedClass)) uniqueClasses.set(normalizedClass, assignment);
      }
      const distinctCandidates = [...uniqueClasses.values()];
      const regularCandidates = distinctCandidates.filter((assignment) => !isScienceStudentClass(assignment.className));
      const scienceCandidates = distinctCandidates.filter((assignment) => isScienceStudentClass(assignment.className));
      const pool = regularCandidates.length > 0
        ? regularCandidates
        : scienceCandidates.length > 0
          ? scienceCandidates
          : assignments;
      const selected = [...pool].sort(this.assignmentOrder)[0]!;
      if (regularCandidates.length === 1) {
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "ONE_REGULAR", reason: null });
      } else if (regularCandidates.length === 0 && scienceCandidates.length > 0) {
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "SCIENCE_ONLY", reason: null });
      } else if (regularCandidates.length > 1) {
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "MULTIPLE_REGULAR" });
      } else if (assignments.some((assignment) => isFutureTermStudentClass(assignment.className))) {
        // 라이브 동기화와 같은 구분 — 다음 학기 반만 가진 학생은 '반 없음'이 아니다.
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "FUTURE_TERM_ONLY" });
      } else {
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "NO_CLASS" });
      }
    }
    const rows: StagedSnapshotRow[] = mutable.map((row) => {
      const selection = row.included ? selections.get(row.sourceStudentNo) : undefined;
      const reason = selection?.reason ?? null;
      return {
        ...row,
        primaryCandidate: row.included && isRepresentativeStudentClass(row.className),
        primarySelected: selection?.selectedOrdinal === row.sourceOrdinal,
        classResolutionStatus: row.included ? selection?.status ?? null : null,
        classResolutionReason: reason,
      };
    });
    const summary = this.summary(basename(directory), rows, groups, fileHashes);
    this.verifyExpected(summary);
    return { rows, summary };
  }

  private summary(
    snapshotId: string,
    rows: readonly StagedSnapshotRow[],
    groups: ReadonlyMap<string, readonly unknown[]>,
    fileHashes: readonly string[],
  ): SnapshotSafeSummary {
    const included = rows.filter((row) => row.included);
    const selected = rows.filter((row) => row.primarySelected);
    const reasons = selected.map((row) => row.classResolutionReason);
    const statuses = selected.map((row) => row.classResolutionStatus);
    const multiStudentNumbers = new Set([...groups].filter(([, assignments]) => assignments.length > 1).map(([studentNo]) => studentNo));
    const multiSelected = selected.filter((row) => multiStudentNumbers.has(row.sourceStudentNo));
    const branchCounts = Object.fromEntries(BRANCHES.map((branch) => {
      const branchRows = rows.filter((row) => row.branchCode === branch);
      const branchIncluded = branchRows.filter((row) => row.included);
      return [branch, {
        raw: branchRows.length,
        students: new Set(branchIncluded.map((row) => row.sourceStudentNo)).size,
        assignments: branchIncluded.length,
      }];
    })) as SnapshotSafeSummary["branchCounts"];
    return {
      snapshotId,
      snapshotHash: createHash("sha256").update(fileHashes.join("|")).digest(),
      rawRows: rows.length,
      includedAssignments: included.length,
      uniqueStudents: groups.size,
      excludedRows: rows.length - included.length,
      ambiguousStudents: reasons.filter((reason) => reason !== null).length,
      oneRegular: statuses.filter((status) => status === "ONE_REGULAR").length,
      scienceOnly: statuses.filter((status) => status === "SCIENCE_ONLY").length,
      multipleRegular: reasons.filter((reason) => reason === "MULTIPLE_REGULAR").length,
      noClass: reasons.filter((reason) => reason === "NO_CLASS").length,
      multiAssignmentGroups: multiStudentNumbers.size,
      multiOneRegular: multiSelected.filter((row) => row.classResolutionStatus === "ONE_REGULAR").length,
      multiScienceOnly: multiSelected.filter((row) => row.classResolutionStatus === "SCIENCE_ONLY").length,
      multiMultipleRegular: multiSelected.filter((row) => row.classResolutionReason === "MULTIPLE_REGULAR").length,
      multiNoClass: multiSelected.filter((row) => row.classResolutionReason === "NO_CLASS").length,
      studentPhonesPresent: selected.filter((row) => row.motherPhoneDigest !== null).length,
      assignmentPhonesPresent: included.filter((row) => row.motherPhoneDigest !== null).length,
      studentFatherPhonesPresent: selected.filter((row) => row.fatherPhoneDigest !== null).length,
      assignmentFatherPhonesPresent: included.filter((row) => row.fatherPhoneDigest !== null).length,
      branchCounts,
    };
  }

  private verifyExpected(summary: SnapshotSafeSummary): void {
    if (summary.rawRows !== 10021 || summary.includedAssignments !== 3799 || summary.uniqueStudents !== 3377
      || summary.excludedRows !== 6222 || summary.ambiguousStudents !== 4 || summary.oneRegular !== 2986
      || summary.scienceOnly !== 387 || summary.multipleRegular !== 1 || summary.noClass !== 3
      || summary.multiAssignmentGroups !== 371 || summary.multiOneRegular !== 298 || summary.multiScienceOnly !== 70
      || summary.multiMultipleRegular !== 1 || summary.multiNoClass !== 2
      || summary.studentPhonesPresent !== 3376 || summary.assignmentPhonesPresent !== 3796
      || summary.studentFatherPhonesPresent !== 0 || summary.assignmentFatherPhonesPresent !== 0) {
      this.fail("SNAPSHOT_GLOBAL_COUNTS_MISMATCH");
    }
    for (const branch of BRANCHES) {
      const actual = summary.branchCounts[branch];
      const expected = SOURCE_FILES[branch];
      if (actual.raw !== expected.raw || actual.students !== expected.students || actual.assignments !== expected.assignments) {
        this.fail("SNAPSHOT_BRANCH_COUNTS_MISMATCH");
      }
    }
  }

  private requireConsistentStudent(assignments: readonly Omit<StagedSnapshotRow, "primaryCandidate" | "primarySelected" | "classResolutionStatus" | "classResolutionReason">[]): void {
    const first = assignments[0]!;
    const key = (row: typeof first): string => [
      row.branchCode, row.name, row.schoolName ?? "", row.grade ?? "", row.motherPhoneDigest?.toString("base64") ?? "",
      row.fatherPhoneDigest?.toString("base64") ?? "",
    ].join("\u0000");
    if (assignments.some((row) => key(row) !== key(first))) this.fail("SNAPSHOT_STUDENT_FIELDS_CONFLICT");
  }

  private readonly assignmentOrder = (
    left: Omit<StagedSnapshotRow, "primaryCandidate" | "primarySelected" | "classResolutionStatus" | "classResolutionReason">,
    right: Omit<StagedSnapshotRow, "primaryCandidate" | "primarySelected" | "classResolutionStatus" | "classResolutionReason">,
  ): number => left.className.localeCompare(right.className, "ko")
    || left.sourceUniqueNo.localeCompare(right.sourceUniqueNo)
    || left.classRegistrationNo.localeCompare(right.classRegistrationNo)
    || left.sourceOrdinal - right.sourceOrdinal;

  private async safeDirectory(supplied: string): Promise<string> {
    if (supplied.trim() === "") this.fail("SNAPSHOT_PATH_REQUIRED");
    const absolute = resolve(supplied);
    const metadata = await lstat(absolute);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) this.fail("SNAPSHOT_DIRECTORY_INVALID");
    return realpath(absolute);
  }

  private async safeFile(directory: string, name: string): Promise<string> {
    const file = join(directory, name);
    if (dirname(file) !== directory) this.fail("SNAPSHOT_FILE_INVALID");
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_FILE_BYTES) this.fail("SNAPSHOT_FILE_INVALID");
    return file;
  }

  private async readChecksums(file: string): Promise<ReadonlyMap<string, string>> {
    const lines = (await readFile(file, "ascii")).split(/\r?\n/);
    const checksums = new Map<string, string>();
    for (const line of lines) {
      const match = /^([0-9a-f]{64})\s+\*?([^/\\]+)$/i.exec(line.trim());
      if (match !== null) checksums.set(match[2]!, match[1]!.toLowerCase());
    }
    for (const branch of BRANCHES) if (!checksums.has(SOURCE_FILES[branch].file)) this.fail("SNAPSHOT_CHECKSUM_MISSING");
    return checksums;
  }

  private required(value: string, code: string): string {
    const normalized = value.normalize("NFKC").trim();
    if (normalized === "") this.fail(code);
    return normalized;
  }

  private optional(value: string): string | null {
    const normalized = value.normalize("NFKC").trim();
    return normalized === "" ? null : normalized;
  }

  private fail(code: string): never {
    throw new DomainError(422, code, "The offline snapshot failed validation.");
  }
}
