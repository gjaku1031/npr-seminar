/**
 * 지점 코드
 */
export type BranchCode = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

/**
 * 초기 스냅샷 파일의 원천 행. 문자열 그대로
 */
export interface SnapshotSourceRow {
  /**
   * 지점 이름
   */
  readonly branch: string;

  /**
   * 지점 코드
   */
  readonly branchCode: string;

  /**
   * 반 이름
   */
  readonly className: string;

  /**
   * 수강 등록 번호
   */
  readonly classRegistrationNo: string;

  /**
   * 재원 상태
   */
  readonly enrollmentStatus: string;

  /**
   * 학년
   */
  readonly gradeName: string;

  /**
   * 어머니 연락처
   */
  readonly motherPhone: string;

  /**
   * 아버지 연락처. 열이 없는 스냅샷이면 생략
   */
  readonly fatherPhone?: string;

  /**
   * 학생 이름
   */
  readonly name: string;

  /**
   * 등록 시작일
   */
  readonly registrationStartedOn: string;

  /**
   * 학교
   */
  readonly schoolName: string;

  /**
   * 원천 고유 번호
   */
  readonly sourceUniqueNo: string;

  /**
   * 학번
   */
  readonly studentNo: string;

  /**
   * 담임
   */
  readonly teacherName: string;

  /**
   * 단위
   */
  readonly unitName: string;
}

/**
 * 정규화·암호화를 마친 스테이징 행. 원천 행 1개당 1개
 */
export interface StagedSnapshotRow {
  /**
   * 지점
   */
  readonly branchCode: BranchCode;

  /**
   * 원천 순번. 1부터
   */
  readonly sourceOrdinal: number;

  /**
   * 원천 고유 번호. 제외 행은 `excluded:{순번}`
   */
  readonly sourceUniqueNo: string;

  /**
   * 수강 등록 번호. 제외 행은 `excluded:{순번}`
   */
  readonly classRegistrationNo: string;

  /**
   * 학번. 제외 행은 `excluded:{순번}`
   */
  readonly sourceStudentNo: string;

  /**
   * 학생 이름
   */
  readonly name: string;

  /**
   * 반 이름
   */
  readonly className: string;

  /**
   * 학교
   */
  readonly schoolName: string | null;

  /**
   * 학년
   */
  readonly grade: string | null;

  /**
   * 대표 담임
   */
  readonly teacherName: string | null;

  /**
   * 표시용 단위
   */
  readonly unitName: string | null;

  /**
   * 어머니 연락처 암호문
   */
  readonly motherPhoneCiphertext: Buffer | null;

  /**
   * 어머니 연락처 다이제스트
   */
  readonly motherPhoneDigest: Buffer | null;

  /**
   * 어머니 연락처 끝 4자리
   */
  readonly motherPhoneLast4: string | null;

  /**
   * 아버지 연락처 암호문
   */
  readonly fatherPhoneCiphertext: Buffer | null;

  /**
   * 아버지 연락처 다이제스트
   */
  readonly fatherPhoneDigest: Buffer | null;

  /**
   * 아버지 연락처 끝 4자리
   */
  readonly fatherPhoneLast4: string | null;

  /**
   * 원천에 아버지 연락처 열이 있었는지 여부. false면 기존 값 유지
   */
  readonly fatherPhoneObserved: boolean;

  /**
   * 원천 재원 상태
   */
  readonly sourceStatus: string;

  /**
   * 정규화 값 기준 행 해시. 변경 감지용
   */
  readonly rowHash: Buffer;

  /**
   * 포함 여부
   */
  readonly included: boolean;

  /**
   * 제외 사유. 포함이면 null
   */
  readonly exclusionReason: "NOT_ACTIVE" | "BRACKETED_CLASS" | null;

  /**
   * 대표 반 후보 여부
   */
  readonly primaryCandidate: boolean;

  /**
   * 학생의 대표 수강 등록으로 선택됐는지 여부
   */
  readonly primarySelected: boolean;

  /**
   * 대표 반 판정 결과. ONE_REGULAR 정규 반 하나, SCIENCE_ONLY 과학 반만, AMBIGUOUS_FALLBACK 판정 불가. 제외 행은 null
   */
  readonly classResolutionStatus: "ONE_REGULAR" | "SCIENCE_ONLY" | "AMBIGUOUS_FALLBACK" | null;

  /**
   * 판정 불가 사유. 정규 반 여러 개, 반 없음, 다음 학기 반만
   */
  readonly classResolutionReason: "MULTIPLE_REGULAR" | "NO_CLASS" | "FUTURE_TERM_ONLY" | null;
}

/**
 * 개인정보 없는 스냅샷 요약
 */
export interface SnapshotSafeSummary {
  /**
   * 스냅샷 ID
   */
  readonly snapshotId: string;

  /**
   * 스냅샷 해시
   */
  readonly snapshotHash: Buffer;

  /**
   * 원천 행 수
   */
  readonly rawRows: number;

  /**
   * 포함 수강 등록 수
   */
  readonly includedAssignments: number;

  /**
   * 고유 학생 수
   */
  readonly uniqueStudents: number;

  /**
   * 제외 행 수
   */
  readonly excludedRows: number;

  /**
   * 대표 반 판정 불가 학생 수
   */
  readonly ambiguousStudents: number;

  /**
   * 정규 반 하나 학생 수
   */
  readonly oneRegular: number;

  /**
   * 과학 반만 있는 학생 수
   */
  readonly scienceOnly: number;

  /**
   * 정규 반 여러 개 학생 수
   */
  readonly multipleRegular: number;

  /**
   * 반 없는 학생 수
   */
  readonly noClass: number;

  /**
   * 수강 등록이 여러 개인 학생 수
   */
  readonly multiAssignmentGroups: number;

  /**
   * 다중 등록 중 정규 반 하나
   */
  readonly multiOneRegular: number;

  /**
   * 다중 등록 중 과학 반만
   */
  readonly multiScienceOnly: number;

  /**
   * 다중 등록 중 정규 반 여러 개
   */
  readonly multiMultipleRegular: number;

  /**
   * 다중 등록 중 반 없음
   */
  readonly multiNoClass: number;

  /**
   * 어머니 연락처가 있는 학생 수
   */
  readonly studentPhonesPresent: number;

  /**
   * 어머니 연락처가 있는 수강 등록 수
   */
  readonly assignmentPhonesPresent: number;

  /**
   * 아버지 연락처가 있는 학생 수
   */
  readonly studentFatherPhonesPresent: number;

  /**
   * 아버지 연락처가 있는 수강 등록 수
   */
  readonly assignmentFatherPhonesPresent: number;

  /**
   * 지점별 원천 행·학생·수강 등록 수
   */
  readonly branchCounts: Readonly<Record<BranchCode, { raw: number; students: number; assignments: number }>>;
}

/**
 * 초기 스냅샷 해석 결과
 */
export interface ParsedOfflineSnapshot {
  /**
   * 스테이징 행
   */
  readonly rows: readonly StagedSnapshotRow[];

  /**
   * 요약
   */
  readonly summary: SnapshotSafeSummary;
}
