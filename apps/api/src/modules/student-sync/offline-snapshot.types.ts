export type BranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

export interface SnapshotSourceRow {
  readonly branch: string;
  readonly branchCode: string;
  readonly className: string;
  readonly classRegistrationNo: string;
  readonly enrollmentStatus: string;
  readonly gradeName: string;
  readonly motherPhone: string;
  readonly fatherPhone?: string;
  readonly name: string;
  readonly registrationStartedOn: string;
  readonly schoolName: string;
  readonly sourceUniqueNo: string;
  readonly studentNo: string;
  readonly teacherName: string;
  readonly unitName: string;
}

export interface StagedSnapshotRow {
  readonly branchCode: BranchCode;
  readonly sourceOrdinal: number;
  readonly sourceUniqueNo: string;
  readonly classRegistrationNo: string;
  readonly sourceStudentNo: string;
  readonly name: string;
  readonly className: string;
  readonly schoolName: string | null;
  readonly grade: string | null;
  readonly teacherName: string | null;
  readonly unitName: string | null;
  readonly motherPhoneCiphertext: Buffer | null;
  readonly motherPhoneDigest: Buffer | null;
  readonly motherPhoneLast4: string | null;
  readonly fatherPhoneCiphertext: Buffer | null;
  readonly fatherPhoneDigest: Buffer | null;
  readonly fatherPhoneLast4: string | null;
  readonly fatherPhoneObserved: boolean;
  readonly sourceStatus: string;
  readonly rowHash: Buffer;
  readonly included: boolean;
  readonly exclusionReason: "NOT_ACTIVE" | "BRACKETED_CLASS" | null;
  readonly primaryCandidate: boolean;
  readonly primarySelected: boolean;
  readonly classResolutionStatus: "ONE_REGULAR" | "SCIENCE_ONLY" | "AMBIGUOUS_FALLBACK" | null;
  readonly classResolutionReason: "MULTIPLE_REGULAR" | "NO_CLASS" | null;
}

export interface SnapshotSafeSummary {
  readonly snapshotId: string;
  readonly snapshotHash: Buffer;
  readonly rawRows: number;
  readonly includedAssignments: number;
  readonly uniqueStudents: number;
  readonly excludedRows: number;
  readonly ambiguousStudents: number;
  readonly oneRegular: number;
  readonly scienceOnly: number;
  readonly multipleRegular: number;
  readonly noClass: number;
  readonly multiAssignmentGroups: number;
  readonly multiOneRegular: number;
  readonly multiScienceOnly: number;
  readonly multiMultipleRegular: number;
  readonly multiNoClass: number;
  readonly studentPhonesPresent: number;
  readonly assignmentPhonesPresent: number;
  readonly studentFatherPhonesPresent: number;
  readonly assignmentFatherPhonesPresent: number;
  readonly branchCounts: Readonly<Record<BranchCode, { raw: number; students: number; assignments: number }>>;
}

export interface ParsedOfflineSnapshot {
  readonly rows: readonly StagedSnapshotRow[];
  readonly summary: SnapshotSafeSummary;
}
