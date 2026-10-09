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

/**
 * 실시간 동기화 원천 충돌
 */
export interface LiveSyncConflict {
  /**
   * 충돌 종류. 같은 등록 키 중복, 같은 학번의 신원 불일치, 여러 지점에 같은 학번
   */
  readonly type: "DUPLICATE_STUDENT_ASSIGNMENT_KEY" | "STUDENT_IDENTITY_MISMATCH" | "CROSS_BRANCH_STUDENT_NO";

  /**
   * 지점. 여러 지점 충돌이면 null
   */
  readonly branch: BranchCode | null;

  /**
   * 학번
   */
  readonly sourceStudentNo: string;

  /**
   * 등록 키 다이제스트. 등록 키 중복일 때만
   */
  readonly sourceAssignmentKeyDigest: string | null;

  /**
   * 개인정보 없는 설명
   */
  readonly detail: string;
}

/**
 * 동기화 건수 요약
 */
export interface LiveSyncCounts {
  /**
   * 조회한 수강 등록 수
   */
  readonly fetchedAssignmentCount: number;

  /**
   * 대괄호 반으로 제외한 수
   */
  readonly bracketExcludedAssignmentCount: number;

  /**
   * 포함 수강 등록 수
   */
  readonly includedAssignmentCount: number;

  /**
   * 고유 학생 수
   */
  readonly uniqueStudentCount: number;

  /**
   * 수강 등록이 여러 개인 학생 수
   */
  readonly multiAssignmentStudentCount: number;

  /**
   * 정규 반 하나로 대표 반 확정한 학생 수
   */
  readonly regularRepresentativeCount: number;

  /**
   * 과학 반만으로 대표 반 정한 학생 수
   */
  readonly scienceAliasRepresentativeCount: number;

  /**
   * 정규 반 여러 개로 판정 불가한 학생 수
   */
  readonly multipleRegularAmbiguousCount: number;

  /**
   * 반 없음으로 판정 불가한 학생 수
   */
  readonly noClassAmbiguousCount: number;

  /**
   * 판정 불가 학생 수 합계
   */
  readonly ambiguousStudentCount: number;

  /**
   * 새로 추가한 학생 수
   */
  readonly insertedStudentCount: number;

  /**
   * 변경한 학생 수
   */
  readonly updatedStudentCount: number;

  /**
   * 비활성화한 학생 수
   */
  readonly inactivatedStudentCount: number;

  /**
   * 새로 추가한 수강 등록 수
   */
  readonly insertedAssignmentCount: number;

  /**
   * 변경한 수강 등록 수
   */
  readonly updatedAssignmentCount: number;

  /**
   * 비활성화한 수강 등록 수
   */
  readonly inactivatedAssignmentCount: number;
}

/**
 * 정규화한 실시간 스냅샷
 */
export interface NormalizedLiveSnapshot {
  /**
   * 스테이징 행
   */
  readonly rows: readonly StagedSnapshotRow[];

  /**
   * 원천 충돌
   */
  readonly conflicts: readonly LiveSyncConflict[];

  /**
   * 전체 건수. 반영 건수는 0으로 채워 반환하고 반영 단계에서 갱신
   */
  readonly counts: LiveSyncCounts;

  /**
   * 지점별 건수
   */
  readonly branchCounts: Readonly<Record<BranchCode, LiveSyncCounts>>;

  /**
   * 지점별 원천 해시를 묶은 스냅샷 해시
   */
  readonly snapshotHash: Buffer;

  /**
   * 스테이징 행 해시. 반영 직전 재확인용
   */
  readonly stagingHash: Buffer;
}

/**
 * 지점 처리 순서
 */
const BRANCH_ORDER: readonly BranchCode[] = ["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"];

/**
 * 대표 반 판정 전 스테이징 행
 */
type MutableRow = Omit<StagedSnapshotRow, "primaryCandidate" | "primarySelected" | "classResolutionStatus" | "classResolutionReason">;

/**
 * 통통통 지점별 조회 결과를 스테이징 행으로 정규화
 *
 * 연락처 암호화, 포함·제외 분류, 학생별 대표 반 선택, 충돌 탐지, 건수·해시 계산
 */
@Injectable()
export class StudentNormalizerService {
  /**
   * 연락처 암호화 주입
   */
  public constructor(private readonly phoneProtector: PhoneProtector) {}

  /**
   * 세 지점 조회 결과 정규화
   *
   * 1. A·B·C 순서와 지점별 비어 있지 않음 확인
   * 2. 원천 순서대로 행 정규화(전 지점 연속 순번)
   * 3. 지점마다 포함 행이 하나 이상인지 확인
   * 4. 학번별 대표 반 선택: 정규 반 > 과학 반 > 전체 등록 중 정렬 첫 번째
   * 5. 충돌·건수·해시 계산
   *
   * @throws {DomainError} 422 지점 순서·빈 스냅샷·필수 값 누락
   */
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

    // 포함 행을 학번별로 묶어 대표 반 선택
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
      // 기본 반 이름이 같은 대표 반 후보는 하나만 남김
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
      // 다음 학기 반만 가진 학생과 반이 아예 없는 학생을 구분
      // 전자는 방금 등록해 개강 전인 재원생이라, 미분류로 묶으면 원인을 다시 찾아야 함
      else if (assignments.some((row) => isFutureTermStudentClass(row.className))) {
        selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "FUTURE_TERM_ONLY" });
      }
      else selections.set(studentNo, { selectedOrdinal: selected.sourceOrdinal, status: "AMBIGUOUS_FALLBACK", reason: "NO_CLASS" });
    }
    // 대표 반 판정 결과를 행에 반영. 제외 행은 판정 없음
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

  /**
   * 원천 행 1개 정규화
   *
   * 포함 행은 필수 값이 비면 실패, 제외 행은 빈 값을 순번 기반 자리 값으로 채움
   * 연락처는 포함 행만 암호화. 아버지 연락처는 열이 있을 때만 관찰한 것으로 기록
   *
   * @throws {DomainError} 422 재원생인데 반 이름·필수 값 누락
   */
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
    // 행 해시: 포함 행은 정규화 값 전체, 제외 행은 지점·순번·사유만
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

  /**
   * 원천 충돌 탐지
   *
   * 지점 안 같은 등록 키 중복, 같은 학번의 여러 지점 등장, 같은 학번의 이름·학교·학년·어머니 연락처 불일치
   */
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

  /**
   * 행 목록 건수 요약. 반영 건수 제외
   */
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

  /**
   * 순번·행 해시·포함·대표 선택 여부로 계산한 스테이징 해시
   */
  private stagingHash(rows: readonly StagedSnapshotRow[]): Buffer {
    const hash = createHash("sha256");
    for (const row of rows) hash.update(`${row.sourceOrdinal}\u0000${row.rowHash.toString("base64url")}\u0000${Number(row.included)}\u0000${Number(row.primarySelected)}\n`);
    return hash.digest();
  }

  /**
   * 수강 등록 정렬. 반 이름(한국어) → 원천 고유 번호 → 등록 번호 → 순번
   */
  private readonly assignmentOrder = (left: MutableRow, right: MutableRow): number => left.className.localeCompare(right.className, "ko")
    || left.sourceUniqueNo.localeCompare(right.sourceUniqueNo)
    || left.classRegistrationNo.localeCompare(right.classRegistrationNo) || left.sourceOrdinal - right.sourceOrdinal;

  /**
   * 실시간 스냅샷 검증 오류 발생
   *
   * @throws {DomainError} 422 지정 코드
   */
  private fail(code: string): never { throw new DomainError(422, code, "The live student snapshot failed validation."); }
}
