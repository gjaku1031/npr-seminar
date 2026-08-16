/**
 * 계약(packages/contracts/openapi.yaml) 타입 재선언 — 인증 + 스캐너 + 공개 학부모 예약.
 * `apps/api` 를 import 하지 않기 위해 여기서 다시 쓴다 — 계약이 단일 진실이다.
 */

/* ── 인증 · 프로젝트 세션 ────────────────────────────────────────────────── */

/** 계약 ActorRole — 콘솔은 ADMIN 만 들어온다. SCANNER 는 스캐너 화면 전용이다. */
export type ActorRole = "ADMIN" | "SCANNER";

/**
 * 계약 CurrentActor (GET /api/v1/auth/me).
 *
 * `deviceId` 는 SCANNER 에만 있다. 만료 시각 두 개는 세션 수명이지 권한이 아니다 —
 * 권한 판정은 언제나 `role` 로 한다.
 */
export interface CurrentActor {
  subjectId: string;
  role: ActorRole;
  displayName: string;
  deviceId: string | null;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
}

/**
 * 계약 LoginRequest (POST /api/v1/auth/login).
 * 값은 시크릿이다 — 저장·로깅·URL 노출이 금지된다.
 */
export interface LoginRequest {
  username: string;
  password: string;
}

export type Branch = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

export const BRANCH_LABELS: Record<Branch, string> = {
  CAMPUS_A: "A",
  CAMPUS_B: "B",
  CAMPUS_C: "C",
};

export const BRANCH_OPTIONS: ReadonlyArray<{ value: Branch; label: string }> = [
  { value: "CAMPUS_A", label: BRANCH_LABELS.CAMPUS_A },
  { value: "CAMPUS_B", label: BRANCH_LABELS.CAMPUS_B },
  { value: "CAMPUS_C", label: BRANCH_LABELS.CAMPUS_C },
];

/**
 * 계약 enum.
 * - ACTIVE: 페어링돼 사용 중.
 * - REVOKED: 관리자가 해제 (REVOKED_BY_ADMIN).
 * - UNPAIRED: 기기가 스스로 해제 (UNPAIRED_BY_DEVICE). 둘 다 hard delete 가 아니라
 *   durable 상태 전이이며 출석·감사 이력은 보존된다.
 */
export type ScannerDeviceStatus = "ACTIVE" | "REVOKED" | "UNPAIRED";

/**
 * 계약 ScannerDevice — PostgreSQL 소유 durable identity + Redis 파생 presence.
 * 배터리 3필드는 nullable 이고 "미지원/미보고" 를 뜻한다. 값을 추정하지 않는다.
 */
export interface ScannerDevice {
  deviceId: string;
  deviceName: string;
  branch: Branch;
  gateCode: string;
  status: ScannerDeviceStatus;
  pairedAt: string;
  revokedAt: string | null;
  /** 온라인 판정의 유일한 근거 — heartbeat 시각으로 재계산하지 않는다. */
  online: boolean;
  presenceExpiresAt: string | null;
  lastBatteryLevelPercent: number | null;
  isCharging: boolean | null;
  batteryReportedAt: string | null;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ScannerDevicePage {
  items: ScannerDevice[];
  page: PageMeta;
}

export type SeminarSessionScope = "ALL" | "BRANCH";

export interface ScannerShiftLock {
  lockId: string;
  deviceId: string;
  branch: Branch;
  gateCode: string;
  seminarSessionId: string;
  sessionScope: SeminarSessionScope;
  sessionBranch: Branch | null;
  lockedAt: string;
  lockedBy: string;
}

export interface ScannerShiftState {
  locked: boolean;
  lock: ScannerShiftLock | null;
}

export interface ScannerDeviceDetail {
  device: ScannerDevice;
  shift: ScannerShiftState;
}

export interface ScannerCurrent {
  device: ScannerDevice;
  shift: ScannerShiftState;
}

/** 계약 PairingCodeMetadata — 원문 코드는 여기 없다. */
export interface PairingCodeMetadata {
  pairingCodeId: string;
  branch: Branch;
  gateCode: string;
  intendedDeviceName: string;
  expiresAt: string;
  /** 계약상 상수 300 (5분). */
  ttlSeconds: number;
}

export interface PairingCodeCreateRequest {
  branch: Branch;
  gateCode: string;
  intendedDeviceName: string;
}

/** 신규 발급만 원문 코드를 준다. idempotency 리플레이는 코드를 생략한다. */
export interface FreshPairingCode {
  pairing: PairingCodeMetadata;
  replayed: false;
  pairingCode: string;
}

export interface ReplayedPairingCode {
  pairing: PairingCodeMetadata;
  replayed: true;
}

export type PairingCodeCreateResult = FreshPairingCode | ReplayedPairingCode;

export function isFreshPairingCode(result: PairingCodeCreateResult): result is FreshPairingCode {
  return result.replayed === false;
}

/** 계약 pattern: 혼동 문자(0,1,I,O)를 뺀 대문자 6자. */
export const PAIRING_CODE_LENGTH = 6;
export const PAIRING_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export interface PairingClaimRequest {
  pairingCode: string;
  deviceName: string;
  clientPlatform: string;
}

export interface PairingClaimResponse {
  device: ScannerDevice;
  /** 재생성된 SCANNER 세션용 새 토큰 — 로그에 남기지 않는다. */
  csrfToken: string;
}

export interface ScannerHeartbeatRequest {
  clientTime: string;
  /** 미지원이면 null 또는 생략. 숫자를 추정하지 않는다. */
  batteryLevelPercent?: number | null;
  isCharging?: boolean | null;
}

export interface ScannerHeartbeatResponse {
  serverTime: string;
  presenceExpiresAt: string;
}

export interface ScannerShiftLockRequest {
  seminarSessionId: string;
}

export interface ShiftReleaseRequest {
  reason: string;
}

export interface DeviceRevocationRequest {
  reason: string;
}

/** 계약 enum — NOT_OPEN(예약 시작 전)과 CLOSED(예약 마감)를 구분한다. */
export type PublicAvailability = "AVAILABLE" | "NOT_OPEN" | "CLOSED";

export const AVAILABILITY_LABELS: Record<PublicAvailability, string> = {
  AVAILABLE: "예약 가능",
  NOT_OPEN: "예약 시작 전",
  CLOSED: "예약 마감",
};

/** 계약 PublicSeminarSession (additionalProperties:false — 필드명을 그대로 따른다). */
export interface PublicSeminarSession {
  seminarId: string;
  seminarSessionId: string;
  /** 계약 필드명은 `seminarTitle` 이다 (`title` 아님). */
  seminarTitle: string;
  scope: SeminarSessionScope;
  /** scope 가 ALL 이면 정확히 null, BRANCH 면 정확히 구체 지점. */
  branch: Branch | null;
  startsAt: string;
  endsAt: string;
  location: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
  /**
   * 계약 필수 필드 — 이 회차에서 재원생이 없는 연락처(비재원)가 guest 흐름을 쓸 수 있는지.
   * 첫 화면 비재원 진입 가능 여부, 회차 선택 가능 여부, 생성 API 최종 검사의 권위다.
   */
  guestBookingEnabled: boolean;
  availability: PublicAvailability;
}

export interface ScannerSessionList {
  items: PublicSeminarSession[];
  shift: ScannerShiftState;
}

export type CheckInResult =
  | "CHECKED_IN"
  /**
   * 입장도 실패도 아니다. QR·회차·예약 상태는 이미 유효한데 2명 예약이라 실제 온 인원을
   * 알려 주지 않았을 뿐이다 — 서버는 **아무것도 바꾸지 않는다**. 스캐너가 스태프에게 묻고
   * attendedCount 를 실어 다시 부른다.
   */
  | "PARTY_SELECTION_REQUIRED"
  | "ALREADY_CHECKED_IN"
  | "CANCELLED"
  | "SESSION_MISMATCH"
  | "EXPIRED_QR"
  | "REVOKED_QR"
  | "INVALID_QR"
  | "RESERVATION_NOT_FOUND"
  | "NOT_AUTHORIZED";

/**
 * 계약 CheckInRepresentativeStudent — 체크인 확인 문구에 쓰는 대표(최고학년) 학생 스냅샷.
 * 동학년은 캠퍼스·단위·반·이름·학번 순으로 정해진다. schoolName/grade/unitName 은 nullable.
 */
export interface CheckInRepresentativeStudent {
  participantType: BookingParticipantType;
  sourceStudentNo: string;
  studentName: string;
  branch: Branch;
  className: string;
  schoolName: string | null;
  grade: string | null;
  unitName: string | null;
}

export interface CheckInOutcome {
  eventId: string;
  result: CheckInResult;
  replayed: boolean;
  familyBookingId: string | null;
  familySeatCount: 1 | 2 | null;
  /** 이 입장이 기록한 인원. CHECKED_IN·ALREADY_CHECKED_IN 에서만 값이 있다. */
  attendedCount: 1 | 2 | null;
  /** 가족 참석 학부모 — 예약을 못 찾으면 null. 스캐너 확인 문구에 그대로 쓴다. */
  attendanceParty: AttendanceParty | null;
  /** 대표(최고학년) 학생 이름 — 확인 문구 전용. 예약을 못 찾으면 null. */
  representativeStudentName: string | null;
  /** 대표 학생 스냅샷 — 예약을 못 찾으면 null. */
  representativeStudent: CheckInRepresentativeStudent | null;
  seminarSessionId: string;
  deviceId: string;
  branch: Branch;
  gateCode: string;
  occurredAt: string;
}

/** 계약 enum. 좌석 수는 서버가 파생한다 (x-server-seat-count: MOTHER 1 / FATHER 1 / BOTH 2). */
export type AttendanceParty = "MOTHER" | "FATHER" | "BOTH";

export const ATTENDANCE_PARTY_LABELS: Record<AttendanceParty, string> = {
  MOTHER: "모",
  FATHER: "부",
  BOTH: "모/부",
};

/**
 * 사용자 노출 참석 학부모 요약 문구 — "모 · 1명" / "부 · 1명" / "모/부 · 2명" 으로 통일한다.
 * 선택 버튼·티켓·예약 요약·스캐너 후보 등 모든 노출 지점이 이 helper 하나만 쓴다(중복 금지).
 * 인원은 서버 좌석 파생(MOTHER 1 / FATHER 1 / BOTH 2)과 동일하다.
 */
export function attendancePartySummary(party: AttendanceParty): string {
  return `${ATTENDANCE_PARTY_LABELS[party]} · ${party === "BOTH" ? 2 : 1}명`;
}

export type FamilyBookingStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

export const FAMILY_BOOKING_STATUS_LABELS: Record<FamilyBookingStatus, string> = {
  RESERVED: "예약",
  CHECKED_IN: "입장 완료",
  CANCELLED: "취소됨",
  NO_SHOW: "미참석",
};

export type BookingParticipantType = "ENROLLED" | "GUEST";

export type BookingSource = "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";

export type QrCredentialStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

/**
 * 계약 FamilyBookingStudentSnapshot — 예약 시점의 참가자 스냅샷.
 * GUEST 는 studentId=null 이고 `비재원-` 로 시작하는 합성 sourceStudentNo 를 갖는다
 * (내부 값이라 화면에 노출하지 않는다). QR·상태·좌석 수는 가족 집계의 몫이다.
 */
export interface FamilyBookingStudentSnapshot {
  familyBookingStudentId: string;
  participantType: BookingParticipantType;
  studentId: string | null;
  sourceStudentNo: string;
  name: string;
  branch: Branch;
  representativeClassName: string | null;
  schoolName: string | null;
  grade: string | null;
  unitName: string | null;
  teacherName: string | null;
}

export interface ManualCheckInCandidate {
  familyBookingId: string;
  /**
   * ★ 스캐너 경로는 **의도적으로 마스킹을 유지한다** — 관리자 응답이 전체 연락처로 바뀐
   * 뒤에도 여기는 그대로다. 현장 태블릿은 공용 화면이라 전체 번호를 띄우지 않는다.
   */
  maskedContact: string;
  attendanceParty: AttendanceParty;
  seatCount: 1 | 2;
  status: FamilyBookingStatus;
  students: FamilyBookingStudentSnapshot[];
}

export interface ManualCheckInCandidateList {
  items: ManualCheckInCandidate[];
}

export interface QrCheckInRequest {
  qrToken: string;
}

export interface ManualCheckInRequest {
  familyBookingId: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 공개 학부모 예약 (tags: Public OTP / Public seminar sessions / Public students /
 * Public family bookings). 전부 계약 그대로 다시 선언한다 — apps/api 를 import 하지 않는다.
 * ──────────────────────────────────────────────────────────────────────────── */

export type OtpPurpose = "FAMILY_BOOKING" | "BOOKING_MANAGE";

export type BookingProofScope = "STUDENT_SEARCH" | "FAMILY_BOOKING" | "BOOKING_READ" | "BOOKING_MANAGE";

/**
 * 계약 OtpChallengeRequest — purpose 로 갈리는 판별 유니언.
 * - FAMILY_BOOKING: `branch` 필수. 선택 캠퍼스가 proof 에 귀속돼 재원생 자동 연결과 guest 정책을 정한다.
 * - BOOKING_MANAGE: `branch` 를 보내지 않는다. 서버가 소유 예약 스냅샷에서 SMS 경로를 파생한다.
 *
 * 학부모 연락처(모 또는 부)는 서버가 8~15자리로 정규화한다. 로깅 금지.
 */
export type OtpChallengeRequest =
  | { contact: string; purpose: "FAMILY_BOOKING"; branch: Branch }
  | { contact: string; purpose: "BOOKING_MANAGE" };

export interface OtpChallengeAccepted {
  challengeId: string;
  expiresAt: string;
  /** 계약상 상수 60. */
  retryAfterSeconds: number;
}

export interface OtpVerifyRequest {
  oneTimeCode: string;
}

/** 신선한 검증만 원문 proof 를 준다. */
export interface FreshOtpProofIssued {
  bookingProof: string;
  expiresAt: string;
  scopes: BookingProofScope[];
  replayed: false;
}

/** idempotency 리플레이 — 원문 proof 가 없다. 잃어버린 proof 는 복구할 수 없다. */
export interface ReplayedOtpProofIssued {
  expiresAt: string;
  scopes: BookingProofScope[];
  replayed: true;
}

export type OtpProofIssued = FreshOtpProofIssued | ReplayedOtpProofIssued;

export function isFreshProof(result: OtpProofIssued): result is FreshOtpProofIssued {
  return result.replayed === false;
}

/**
 * 계약 RepresentativeResolution.
 * - REGULAR: 정규 후보가 정확히 하나 — 그 반이 대표다.
 * - SCIENCE_ALIAS: 정규 0 + 과학 1 이상 — `과학` 으로 표시된다.
 * - MULTIPLE_REGULAR / NO_CLASS: 둘 다 모호(ambiguous)라 대표를 정할 수 없다.
 */
export type RepresentativeResolution = "REGULAR" | "SCIENCE_ALIAS" | "MULTIPLE_REGULAR" | "NO_CLASS";

export interface RepresentativeClass {
  resolution: RepresentativeResolution;
  /** 정확한 반, SCIENCE_ALIAS 면 `과학`, 모호하면 null. */
  displayName: string | null;
  ambiguous: boolean;
  regularCandidateCount: number;
  scienceCandidateCount: number;
  selectedSourceAssignmentKey: string | null;
}

export interface PublicStudent {
  studentId: string;
  sourceStudentNo: string;
  name: string;
  branch: Branch;
  schoolName: string | null;
  grade: string | null;
  representativeClass: RepresentativeClass;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 학생 현황 (tags: Admin students / Admin student sync).
 * openapi.yaml AdminStudentPage · StudentSyncStatus 를 그대로 다시 선언한다.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 StudentSourceAssignment — 학생 1명이 원천에서 여러 반에 걸릴 수 있다.
 * `teacherName` 은 **여기에만** 있다 — AdminStudent 최상위에는 담임 필드가 없으므로
 * 화면의 담임 열은 대표 배정(selectedSourceAssignmentKey)을 통해서만 말할 수 있다.
 */
export interface StudentSourceAssignment {
  assignmentId: string;
  sourceAssignmentKey: string;
  sourceStudentNo: string;
  branch: Branch;
  className: string;
  schoolName: string | null;
  grade: string | null;
  teacherName: string | null;
  sourceStatus: string | null;
  sourceActive: boolean;
  candidateType: "REGULAR" | "SCIENCE" | "NONE";
  exclusionReason: "SUPPLEMENTARY" | "NONE";
  firstSeenRunId: string;
  lastSeenRunId: string;
}

/**
 * 계약 AdminStudent (additionalProperties:false).
 *
 * 연락처는 `motherPhone`·`fatherPhone` 두 갈래이고 **정규화된 전체 번호**(8~15자리 숫자)다.
 * 저장된 값이 없으면 null 이다 — 둘 다 null 일 수 있다. 표기는 `fmtPhone` 을 거친다.
 */
export interface AdminStudent {
  studentId: string;
  sourceStudentNo: string;
  name: string;
  branch: Branch;
  schoolName: string | null;
  grade: string | null;
  motherPhone: string | null;
  fatherPhone: string | null;
  unitName: string | null;
  sourceActive: boolean;
  representativeClass: RepresentativeClass;
  /** 수학 정규반 이름 — 배정이 없으면 null. */
  mathClassName: string | null;
  /** 과학반 이름 목록 — 없으면 빈 배열. 대표 반과 별개의 실제 배정 목록이다. */
  scienceClassNames: string[];
  /** 선택 회차에 RESERVED·CHECKED_IN·NO_SHOW 예약이 있으면 true. */
  hasReservation: boolean;
  /** 선택 회차 예약 투영. 회차 미지정 또는 예약이 없으면 null. */
  reservation: AdminStudentReservationProjection | null;
  assignments: StudentSourceAssignment[];
  firstSeenAt: string;
  lastSeenAt: string;
}

/** 계약 AdminStudentReservation — 선택 회차의 가족 예약 투영. */
export interface AdminStudentReservationProjection {
  status: FamilyBookingStatus;
  hasReservation: boolean;
  familyBookingId: string;
  attendanceParty: AttendanceParty;
  bookingSource: BookingSource;
}

/**
 * 계약 StudentClassificationSummary.
 *
 * ★ 범위(계약 그대로): 대부분의 값은 **분원(branch) + 단위(unitGroup) + sourceActive:true**
 *   범위에서만 센 분류 집계다 — 그래서 **단위 탭을 바꾸면 이 수들도 함께 바뀐다**. 검색어(q)·
 *   담임(teacherName)·resolution·categorizedOnly·페이지 등 **나머지** 목록 필터는 의도적으로
 *   무시해 브라우징 중에도 헤더가 안정적이다.
 * ★ 예외: `reviewRequiredStudentCount`(확인 필요) 하나만 **분원(branch) 범위만**이고 단위와
 *   그 밖의 모든 필터를 무시한다 — 단위를 바꿔도 이 수는 그대로다.
 * ★ 반면 `AdminStudentPage.page.totalItems` 와 `items` 는 그 모든 필터가 걸린 결과다.
 *   클라이언트는 요약을 다시 세거나 별도 요청을 더 쏘지 않고 서버 값을 그대로 그린다.
 *
 * 표시용 최종 4수는 아래 **신규 필드**다(재원생·수학 정규반·과학 정규반·확인 필요). 롤링
 * 배포로 아직 신규 필드가 없을 수 있어 선택 필드로 두고, 없을 때만 각각 대응하는 레거시
 * 필드로 떨어진다(`resolveStudentSummaryCounts` 가 그 폴백을 순수하게 판정한다).
 */
export interface StudentClassificationSummary {
  uniqueStudentCount: number;
  multiAssignmentStudentCount: number;
  regularRepresentativeCount: number;
  scienceAliasRepresentativeCount: number;
  multipleRegularAmbiguousCount: number;
  noClassAmbiguousCount: number;
  ambiguousStudentCount: number;
  /** 레거시 폴백 — 신규는 `mathStudentCount`. 수학 정규반에 배정된 학생 수. */
  mathRegularStudentCount: number;
  /** 레거시 폴백 — 신규는 `scienceOnlyStudentCount`. 과학 정규반에 배정된 학생 수. */
  scienceRegularStudentCount: number;
  /**
   * 재원생 — 분류된 재원 합집합(무반 제외)의 UI 총원. branch+unitGroup 범위.
   * 롤링 배포로 아직 없을 수 있다(폴백: `uniqueStudentCount`).
   */
  eligibleUniqueStudentCount?: number;
  /**
   * 수학 정규반 — 수학이 있는 **전원**(수학+과학 겸 학생 포함). branch+unitGroup 범위.
   * 폴백: `mathRegularStudentCount`.
   */
  mathStudentCount?: number;
  /**
   * 과학 정규반 — 수학이 없는 과학 학생. branch+unitGroup 범위.
   * 폴백: `scienceRegularStudentCount`.
   */
  scienceOnlyStudentCount?: number;
  /**
   * 확인 필요 — 분류 이상 전부. **branch 범위만**(unitGroup·그 밖의 모든 필터 무시).
   * 폴백: `ambiguousStudentCount`.
   */
  reviewRequiredStudentCount?: number;
}

export interface AdminStudentPage {
  items: AdminStudent[];
  page: PageMeta;
  summary: StudentClassificationSummary;
  /** 마지막으로 **성공**한 동기화 시각. 동기화 이력이 없으면 null. */
  latestSuccessfulSyncAt: string | null;
  /**
   * 담임 선택지의 출처(계약 추가 필드). facets.teachers 는 teacherName 을 뺀 나머지 필터
   * (branch·unitGroup·query·sourceActive 등)에 걸리는 **전체** 결과의 서로 다른 대표 담임
   * 목록이다 — 페이지네이션과 무관하다. 서버가 NFKC 정규화 → 첫 콤마 담임 trim → 공백 제거
   * → 중복 제거 → 한글 정렬까지 마쳐 준다. 그래서 클라이언트가 페이지 items 로 다시 세지 않는다.
   */
  facets: AdminStudentFacets;
}

/** 계약 AdminStudentPage.facets — 담임 필터 선택지의 출처. */
export interface AdminStudentFacets {
  teachers: string[];
}

/** 계약 SyncCircuitStatus — 두 상태뿐이다. HALF_OPEN 은 이 시스템에 없다. */
export type SyncCircuitStatus = "CLOSED" | "OPEN";

export interface SyncCircuit {
  status: SyncCircuitStatus;
  version: number;
  openedAt: string | null;
  openedReasonCode: string | null;
  openedRunId: string | null;
  lastResetAt: string | null;
  lastResetBy: string | null;
}

export type SyncRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "READY_TO_PUBLISH"
  | "PUBLISHING"
  | "SUCCEEDED"
  | "NO_CHANGES"
  | "PUBLISHED"
  | "FAILED"
  | "CONFLICT"
  | "CANCELLED";

export type BranchSyncStatus =
  | "PENDING"
  | "FETCHING"
  | "STAGED"
  | "VALIDATED"
  | "READY_TO_PUBLISH"
  | "PROMOTING"
  | "PROMOTED"
  | "NO_CHANGES"
  | "FAILED"
  | "CONFLICT"
  | "CANCELLED";

export type SyncRunType = "SCHEDULED" | "MANUAL" | "INITIAL_SNAPSHOT_DRY_RUN";

/** 실행이 아직 끝나지 않은 상태 — 이 동안에만 status 를 폴링한다. */
const ACTIVE_SYNC_RUN_STATUSES: ReadonlySet<SyncRunStatus> = new Set<SyncRunStatus>([
  "QUEUED",
  "RUNNING",
  "READY_TO_PUBLISH",
  "PUBLISHING",
]);

export function isActiveSyncRun(status: SyncRunStatus): boolean {
  return ACTIVE_SYNC_RUN_STATUSES.has(status);
}

/** 분원 실행이 성공으로 끝난 상태 — 화면의 `완료` 표시는 이 집합으로만 판정한다. */
const SETTLED_BRANCH_SYNC_STATUSES: ReadonlySet<BranchSyncStatus> = new Set<BranchSyncStatus>([
  "PROMOTED",
  "NO_CHANGES",
]);

export function isBranchSyncSettled(status: BranchSyncStatus): boolean {
  return SETTLED_BRANCH_SYNC_STATUSES.has(status);
}

const FAILED_BRANCH_SYNC_STATUSES: ReadonlySet<BranchSyncStatus> = new Set<BranchSyncStatus>([
  "FAILED",
  "CONFLICT",
  "CANCELLED",
]);

export function isBranchSyncFailed(status: BranchSyncStatus): boolean {
  return FAILED_BRANCH_SYNC_STATUSES.has(status);
}

export const BRANCH_SYNC_STATUS_LABELS: Record<BranchSyncStatus, string> = {
  PENDING: "대기",
  FETCHING: "가져오는 중",
  STAGED: "검토 중",
  VALIDATED: "검증됨",
  READY_TO_PUBLISH: "반영 대기",
  PROMOTING: "반영 중",
  PROMOTED: "완료",
  NO_CHANGES: "변경 없음",
  FAILED: "실패",
  CONFLICT: "충돌",
  CANCELLED: "취소됨",
};

export const SYNC_RUN_STATUS_LABELS: Record<SyncRunStatus, string> = {
  QUEUED: "대기 중",
  RUNNING: "동기화 중",
  READY_TO_PUBLISH: "반영 대기",
  PUBLISHING: "반영 중",
  SUCCEEDED: "완료",
  NO_CHANGES: "변경 없음",
  PUBLISHED: "완료",
  FAILED: "실패",
  CONFLICT: "충돌",
  CANCELLED: "취소됨",
};

/** 계약 SyncCounts — 16개 전부 정수다. */
export interface SyncCounts {
  fetchedAssignmentCount: number;
  bracketExcludedAssignmentCount: number;
  includedAssignmentCount: number;
  uniqueStudentCount: number;
  multiAssignmentStudentCount: number;
  regularRepresentativeCount: number;
  scienceAliasRepresentativeCount: number;
  multipleRegularAmbiguousCount: number;
  noClassAmbiguousCount: number;
  ambiguousStudentCount: number;
  insertedStudentCount: number;
  updatedStudentCount: number;
  inactivatedStudentCount: number;
  insertedAssignmentCount: number;
  updatedAssignmentCount: number;
  inactivatedAssignmentCount: number;
}

/** 계약 BranchSyncRun — `sequence` 는 CAMPUS_A=1 / CAMPUS_B=2 / CAMPUS_C=3 순차 실행 순서다. */
export interface BranchSyncRun {
  branch: Branch;
  sequence: 1 | 2 | 3;
  status: BranchSyncStatus;
  counts: SyncCounts;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
}

export interface SyncRun {
  syncRunId: string;
  runType: SyncRunType;
  status: SyncRunStatus;
  branchOrder: [Branch, Branch, Branch];
  branches: BranchSyncRun[];
  counts: SyncCounts;
  startedAt: string;
  finishedAt: string | null;
  publishedAt: string | null;
  errorCode: string | null;
  requestedBy: string | null;
  reason: string | null;
}

export interface CanonicalSnapshotBaseline {
  capturedAt: string;
  uniqueStudentCount: number;
  includedAssignmentCount: number;
}

/**
 * 계약 StudentSyncStatus (additionalProperties:false).
 *
 * ★ 계약에 **다음 동기화 예정 시각이 없다**. 스케줄은 `scheduleIntervalHours`(6) +
 * `scheduleZone`(Asia/Seoul) 로만 표현되므로, 화면은 주기를 말할 수는 있어도
 * 구체적 다음 시각을 말할 수 없다 — 클라이언트가 계산해 지어내지 않는다.
 *
 * ★ 분원별 상태도 최상위에 없다. `latestRun.branches[]` 안에만 있고,
 * `latestRun` 이 null 이면 분원 정보는 아예 없다.
 */
export interface StudentSyncStatus {
  studentSourceOfTruth: "POSTGRESQL";
  scheduleZone: "Asia/Seoul";
  scheduleIntervalHours: 6;
  branchOrder: [Branch, Branch, Branch];
  circuit: SyncCircuit;
  /**
   * 이 배포의 실시간 원천(Tong) 어댑터가 실제로 붙어 실행을 시작할 수 있는가.
   *
   * ★ 회로(circuit)와 **별개의 축**이다. 회로가 CLOSED 여도 어댑터 연동 자체가 꺼져 있으면
   *   이 값이 false 이고, 그때는 수동 실행을 시작할 수 없다 — 재시도가 아니라 운영자가 연동을
   *   켜야 풀린다. 값은 서버가 판정하며 화면은 추정하지 않는다.
   */
  liveSourceReady: boolean;
  /** 상태와 무관하게 가장 최근 실행이다 — 진행 중 판정은 `isActiveSyncRun(latestRun.status)`. */
  latestRun: SyncRun | null;
  canonicalReference: CanonicalSnapshotBaseline;
}

/** 계약 ManualSyncRequest — reason 은 필수이고 3~500자다. */
export interface ManualSyncRequest {
  reason: string;
}

export interface PublicStudentPage {
  items: PublicStudent[];
  page: PageMeta;
}

export interface PublicSeminarSessionPage {
  items: PublicSeminarSession[];
  page: PageMeta;
}

export interface FamilyBooking {
  familyBookingId: string;
  seminarSessionId: string;
  /**
   * 정규화된 전체 예약 연락처(8~15자리 숫자). ADMIN 응답과 OTP proof 로 본인이 소유를
   * 증명한 공개 생성·관리 응답에만 실린다. 표기는 `fmtPhone` 을 거친다.
   */
  contact: string;
  attendanceParty: AttendanceParty;
  bookingSource: BookingSource;
  /** 서버 파생 — MOTHER=1 / FATHER=1 / BOTH=2. 자녀 수로 늘어나지 않는다. */
  seatCount: 1 | 2;
  /** 실제 입장 인원 — 게이트에서 정한다. 미입장이면 null. */
  attendedCount: 1 | 2 | null;
  /** QR 리허설용 예약. 통계·시트·일반 문자에서 제외된다. */
  isTest: boolean;
  status: FamilyBookingStatus;
  students: FamilyBookingStudentSnapshot[];
  qrStatus: QrCredentialStatus;
  qrVersion: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
}

export interface OwnedFamilyBookingList {
  items: FamilyBooking[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * 공개 마스킹 가족 예약 (계약 PublicMaskedFamilyBooking / PublicMaskedFamilyBookingList).
 *
 * ★ 공개 self-service 관리 경로(조회·상세·회차 이동·참석 변경·취소)가 다루는 **유일한** 읽기
 *   모델이다. 전체 `FamilyBooking`(연락처 원문·학생 실명 포함)과 달리, 서버가 이미 **이름과
 *   연락처를 마스킹해** 내려준다: `participants[].maskedName`(`홍*동`)과 `maskedContact`
 *   (`010-****-1234`). 프론트는 이 값을 **그대로 표시**한다 — 다시 마스킹하거나(이중 마스킹),
 *   복원·역마스킹·저장·로깅·URL 노출을 하지 않는다.
 * ──────────────────────────────────────────────────────────────────────────── */

/** 계약 PublicMaskedFamilyBookingParticipant — 참가자 스냅샷의 **마스킹된** 최소 투영. */
export interface PublicMaskedFamilyBookingParticipant {
  participantType: BookingParticipantType;
  /** 서버가 마스킹한 이름(`홍*동`). 그대로 표시한다 — 다시 마스킹하지 않는다. */
  maskedName: string;
  branch: Branch;
}

/**
 * 계약 PublicMaskedFamilyBooking — 공개 관리 경로의 마스킹 가족 예약 집계.
 * enum·좌석 파생 규칙은 전체 `FamilyBooking` 과 동일하되, 신원 필드만 마스킹돼 있고
 * 학생 식별자·학교·학번·담임 같은 민감 필드는 아예 오지 않는다.
 */
export interface PublicMaskedFamilyBooking {
  familyBookingId: string;
  seminarSessionId: string;
  /** 서버가 마스킹한 예약 연락처(`010-****-1234`). 그대로 표시한다. */
  maskedContact: string;
  attendanceParty: AttendanceParty;
  bookingSource: BookingSource;
  /** 서버 파생 — MOTHER=1 / FATHER=1 / BOTH=2. 자녀 수로 늘어나지 않는다. */
  seatCount: 1 | 2;
  status: FamilyBookingStatus;
  participants: PublicMaskedFamilyBookingParticipant[];
  qrStatus: QrCredentialStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  checkedInAt: string | null;
  cancelledAt: string | null;
}

/** 계약 PublicMaskedFamilyBookingList — 연락처 조회(lookup) 결과. 매칭이 없으면 빈 배열. */
export interface PublicMaskedFamilyBookingList {
  items: PublicMaskedFamilyBooking[];
}

/** 계약 PublicGuestParticipantInput.grade enum — 정확히 이 12개뿐이다. */
export type GuestGrade =
  | "초1" | "초2" | "초3" | "초4" | "초5" | "초6"
  | "중1" | "중2" | "중3"
  | "고1" | "고2" | "고3";

export const GUEST_GRADE_OPTIONS: ReadonlyArray<{ value: GuestGrade; label: GuestGrade }> = [
  { value: "초1", label: "초1" },
  { value: "초2", label: "초2" },
  { value: "초3", label: "초3" },
  { value: "초4", label: "초4" },
  { value: "초5", label: "초5" },
  { value: "초6", label: "초6" },
  { value: "중1", label: "중1" },
  { value: "중2", label: "중2" },
  { value: "중3", label: "중3" },
  { value: "고1", label: "고1" },
  { value: "고2", label: "고2" },
  { value: "고3", label: "고3" },
];

/** 계약 PublicGuestParticipantInput — name/branch/schoolName/grade 모두 필수다. */
export interface PublicGuestParticipantInput {
  name: string;
  branch: Branch;
  schoolName: string;
  grade: GuestGrade;
}

/**
 * 계약 oneOf + discriminator(participantType):
 * ENROLLED 는 서버가 proof 연락처로 활성 자녀를 자동 연결한다(본문에 studentIds 없음),
 * GUEST 는 guest 필수. 검증된 연락처는 proof 에서만 오고 본문에 다시 넣지 않는다.
 */
export type PublicFamilyBookingCreateRequest =
  | {
      participantType: "ENROLLED";
      seminarSessionId: string;
      attendanceParty: AttendanceParty;
    }
  | {
      participantType: "GUEST";
      seminarSessionId: string;
      attendanceParty: AttendanceParty;
      guest: PublicGuestParticipantInput;
    };

/**
 * 계약 minProperties: 2 — expectedVersion 외 최소 한 필드가 필요하다.
 * ★ 공개 자기관리에서 자동 연결된 학생 구성은 **불변**이다 — 계약에 studentIds 가 없다.
 *   회차 이동·참석자 변경만 보낸다(학생 변경은 관리자 경로 전용).
 */
export interface PublicFamilyBookingUpdateRequest {
  /** 있으면 원자적 회차 이동 — 활성 가족 QR 은 유지된다. */
  seminarSessionId?: string;
  attendanceParty?: AttendanceParty;
  expectedVersion: number;
}

export interface PublicCancellationRequest {
  expectedVersion: number;
  reason?: string | null;
}

/**
 * 계약 PublicFamilyBookingReadSessionRequest (POST /public/family-bookings/{id}/read-session).
 * 연락처 조회로 이미 메모리에 있는 전체 연락처만 본문에 싣는다 — path·query·log 금지.
 * 서버가 정규화해 **정확히 그 예약 하나**와 대조하고, 통과하면 30분 읽기 전용 관리 세션을 세운다.
 * 성공 응답은 `BookingAccessExchangeResult`(새 csrfToken 포함)로 개인 링크 교환과 같다.
 */
export interface PublicFamilyBookingReadSessionRequest {
  contact: string;
}

/**
 * 계약 BookingAccessExchangeRequest (POST /public/booking-access/session).
 * accessToken 은 SMS 개인 링크의 URL fragment 로만 오고 이 본문에만 실린다 — path·query·log 금지.
 * contact 는 정규화 전 전체 전화번호(뒷자리만으로는 안 된다).
 */
export interface BookingAccessExchangeRequest {
  accessToken: string;
  contact: string;
}

/**
 * 계약 BookingAccessExchangeResult — 30분 예약 범위 관리 세션(HttpOnly 쿠키)이 만들어진다.
 * 세션 고정 방지로 브라우저 세션이 재생성되므로 새 `csrfToken` 을 즉시 채택해야 한다.
 */
export interface BookingAccessExchangeResult {
  familyBookingId: string;
  expiresAt: string;
  csrfToken: string;
}

/**
 * 계약 QrRecoveryResult (GET /public/family-bookings/{id}/qr).
 * AEAD 로 복호화·digest 검증된 **현재 활성 QR** 원문이다 — 재발급이 아니라 조회다.
 * 관리 세션 쿠키 또는 legacy BOOKING_MANAGE proof 중 하나로 인증한다. 로깅 금지.
 */
export interface QrRecoveryResult {
  familyBookingId: string;
  version: number;
  expiresAt: string;
  qrToken: string;
}

/** 신규 커밋만 최상위에 원문 qrToken 을 준다. */
export interface FreshFamilyBookingMutation {
  booking: FamilyBooking;
  replayed: false;
  qrToken: string;
  qrExpiresAt: string;
}

/** 리플레이 — 원문 QR 은 저장되지 않으므로 복구할 수 없다. */
export interface ReplayedFamilyBookingMutation {
  booking: FamilyBooking;
  replayed: true;
}

export type FamilyBookingMutationResult = FreshFamilyBookingMutation | ReplayedFamilyBookingMutation;

export function isFreshBooking(result: FamilyBookingMutationResult): result is FreshFamilyBookingMutation {
  return result.replayed === false;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 설명회 · 회차 (tag: Admin seminars).
 * ★ 회차만 평평하게 주는 목록 엔드포인트가 없다 — 설명회를 먼저 읽고 그 아래 회차를
 *   설명회별로 읽어야 한다.
 * ──────────────────────────────────────────────────────────────────────────── */

export type SeminarStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export interface Seminar {
  seminarId: string;
  title: string;
  description: string | null;
  status: SeminarStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SeminarPage {
  items: Seminar[];
  page: PageMeta;
}

export type SeminarSessionStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED" | "ARCHIVED";

/**
 * 계약 SessionOperationsSummary — 회차 목록 항목마다 서버가 함께 주는 **가족 예약 건수** 집계
 * (좌석 원장이 아니다). 서버 원시 필드명은 `activeBookingCount…` 지만, 어댑터가 화면이 쓰는
 * 이 이름으로 정규화한다.
 *
 * active = RESERVED + CHECKED_IN (**NO_SHOW 제외**). unchecked = RESERVED 만.
 * noShow 는 active·unchecked·cancelled 어디에도 섞이지 않는다.
 */
export interface SeminarSessionOperationsSummary {
  /** 활성 예약 = RESERVED + CHECKED_IN (NO_SHOW 제외). */
  activeCount: number;
  /** 입장 완료 = CHECKED_IN. */
  checkedInCount: number;
  /** 미체크 = RESERVED (아직 입장 안 함). NO_SHOW 제외. */
  uncheckedCount: number;
  /** 취소 = CANCELLED. */
  cancelledCount: number;
  /** 노쇼 = NO_SHOW. active·unchecked·cancelled 어디에도 안 들어간다. */
  noShowCount: number;
}

/**
 * 계약 AdminSeminarSession — 공개용 PublicSeminarSession 과 다른 타입이다
 * (이쪽은 `status`·`version` 이 있고 `availability`·`seminarTitle` 이 없다).
 * DB 컬럼은 place 지만 계약 필드명은 `location` 이다.
 */
export interface AdminSeminarSession {
  seminarSessionId: string;
  seminarId: string;
  scope: SeminarSessionScope;
  /** scope 가 ALL 이면 정확히 null, BRANCH 면 정확히 구체 지점. */
  branch: Branch | null;
  startsAt: string;
  endsAt: string;
  location: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
  status: SeminarSessionStatus;
  /** 계약 필수 필드 — 이 회차의 비재원생(guest) 예약 허용 여부. 관리자 토글이 PATCH 로 바꾼다. */
  guestBookingEnabled: boolean;
  /**
   * 회차 목록 엔드포인트가 항목마다 함께 주는 가족 예약 건수 집계. 콘솔은 오직 이 목록으로만
   * 회차를 읽고 어댑터가 항상 채워 주므로, 모든 카드가 좌석 원장(reservedCount) 근사 없이
   * 자기 실집계를 표시한다.
   */
  operationsSummary: SeminarSessionOperationsSummary;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSeminarSessionPage {
  items: AdminSeminarSession[];
  page: PageMeta;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 가족 예약 (tag: Admin family bookings).
 * 읽기 모델은 공개 예약과 같은 `FamilyBooking` 집계를 그대로 돌려준다.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface FamilyBookingPage {
  items: FamilyBooking[];
  page: PageMeta;
}

/**
 * 계약 AdminFamilyBookingUpdateRequest — 관리자는 `reason` 이 **필수**다(공개 경로와 다름).
 * `attendanceParty` 전용 엔드포인트는 없다 — 이 일반 update 의 한 필드다.
 */
export interface AdminFamilyBookingUpdateRequest {
  seminarSessionId?: string;
  attendanceParty?: AttendanceParty;
  studentIds?: string[];
  expectedVersion: number;
  reason: string;
}

/**
 * 계약 AdminCancellationType — 관리자 취소는 자유 사유가 아니라 **정해진 갈래**다.
 * PHONE(전화취소)·TEACHER(선생님취소)·OTHER(기타취소) 세 가지뿐이다.
 */
export type AdminCancellationType = "PHONE" | "TEACHER" | "OTHER";

const ADMIN_CANCELLATION_TYPE_LABELS: Record<AdminCancellationType, string> = {
  PHONE: "전화취소",
  TEACHER: "선생님취소",
  OTHER: "기타취소",
};

export const ADMIN_CANCELLATION_TYPE_OPTIONS: ReadonlyArray<{ value: AdminCancellationType; label: string }> = [
  { value: "PHONE", label: ADMIN_CANCELLATION_TYPE_LABELS.PHONE },
  { value: "TEACHER", label: ADMIN_CANCELLATION_TYPE_LABELS.TEACHER },
  { value: "OTHER", label: ADMIN_CANCELLATION_TYPE_LABELS.OTHER },
];

/**
 * 계약 AdminCancellationRequest — 관리자 취소 본문은 정확히 `{expectedVersion, cancellationType}` 다.
 * 자유 사유(reason)는 받지 않는다(공개 취소만 선택적 reason 을 가진다).
 */
export interface AdminCancellationRequest {
  expectedVersion: number;
  cancellationType: AdminCancellationType;
}

/** 계약 AdminBookingSource — WEB_APP 은 공개 예약 전용이라 관리자가 쓸 수 없다. */
export type AdminBookingSource = "PHONE" | "TEACHER" | "ON_SITE";

export const ADMIN_BOOKING_SOURCE_LABELS: Record<AdminBookingSource, string> = {
  PHONE: "전화예약",
  TEACHER: "선생님 예약",
  ON_SITE: "현장 예약",
};

/**
 * 계약 AdminFamilyBookingCreateRequest (oneOf, discriminator: participantType).
 *
 * `contact` 는 **두 갈래 모두 필수**이고 write-only 다. ENROLLED 는 선택한 학생 전원의
 * 저장된 모/부 연락처와 digest 가 일치해야 하며, 어긋나면 403
 * STUDENT_CONTACT_OWNERSHIP_MISMATCH 다.
 *
 * ★ `reason` 은 **선택**이다 — 생략하면 서버가 `bookingSource` 로 감사 사유를 파생한다. 그래서
 *   화면은 자유 사유를 받지 않고, 없을 때 지어낸 값을 채워 넣는 대신 키 자체를 빼고 보낸다.
 */
export type AdminFamilyBookingCreateRequest =
  | {
      participantType: "ENROLLED";
      seminarSessionId: string;
      contact: string;
      attendanceParty: AttendanceParty;
      bookingSource: AdminBookingSource;
      studentIds: string[];
      reason?: string;
    }
  | {
      participantType: "GUEST";
      seminarSessionId: string;
      contact: string;
      attendanceParty: AttendanceParty;
      bookingSource: AdminBookingSource;
      guest: PublicGuestParticipantInput;
      reason?: string;
    };

/* ── 회차 예약 명단 (계약 GET /admin/seminar-sessions/{id}/roster) ───────── */

/**
 * 계약 RosterUnitGroup — 상단 단위 탭이 서버로 보내는 값.
 *
 * ★ `단위`는 **서버가 반의 접두사로 판정한다**. 화면은 탭 ↔ 이 enum 만 잇고,
 *   반명을 뜯어 단위를 다시 계산하지 않는다 (SPECIAL_PURPOSE = 특목·예중1·예고1 처럼
 *   규칙이 서버에만 있다). GUEST 는 비재원생 행만 남기는 탭이다.
 */
export type RosterUnitGroup =
  | "ALL"
  | "ELEMENTARY"
  | "MIDDLE_1"
  | "MIDDLE_2"
  | "MIDDLE_3"
  | "SPECIAL_PURPOSE"
  | "HIGH"
  | "SCIENCE"
  | "GUEST";

/** 계약 SessionRosterRow.unitName — 서버가 판정한 정규 단위명. 규칙은 서버 몫이다. */
export type RosterUnitName = "초등" | "중등1" | "중등2" | "중등3" | "특목" | "예중1" | "예고1" | "고등" | "과학";

/**
 * 계약 SessionRosterBookingProjection — 그 행이 가리키는 **가족 예약 집계**의 투영.
 *
 * ★ 형제는 각자 행으로 오되 같은 `familyBookingId` 를 되풀이한다 — 즉 이 값을 바꾸는
 *   조작은 언제나 가족 전체에 걸린다. `seatCount` 도 참석 학부모로만 정해진다.
 */
export interface SessionRosterBookingProjection {
  familyBookingId: string;
  familyBookingStudentId: string;
  status: FamilyBookingStatus;
  attendanceParty: AttendanceParty;
  bookingSource: BookingSource;
  /** 예약 인원. 계약 enum [1, 2]. */
  seatCount: number;
  /**
   * 실제로 입장한 인원 — 게이트에서 정한다. 미입장이면 null 이고, 2명 예약에 한 분만
   * 온 경우 seatCount 보다 작다.
   */
  attendedCount: 1 | 2 | null;
  /** QR 리허설용 예약. 통계·시트·일반 문자에서 빠지고 명단 맨 앞에 고정된다. */
  isTest: boolean;
  checkedInAt: string | null;
  cancelledAt: string | null;
  /** 낙관적 잠금 값 — 조작에 그대로 실어 보낸다. */
  version: number;
}

/** 계약 RosterOperationalEventType — QR 수명주기 이벤트는 서버가 이미 걸러낸다. */
export type RosterOperationalEventType = "CREATED" | "UPDATED" | "CANCELLED" | "CHECKED_IN" | "MARKED_NO_SHOW";

/**
 * 계약 SessionRosterOperationalEvent.label 의 enum — 서버가 주는 값은 **정확히 이 여섯 개**다.
 *
 * `string` 으로 두면 화면이 임의 문구를 label 자리에 넣어도 타입이 통과한다. 좁혀 두면
 * 계약에 없는 문구를 만드는 순간 컴파일이 막는다. 런타임 값은 바꾸지 않는다 — 이건 순수 타입이다.
 */
export type RosterOperationalEventLabel =
  | "웹앱 예약"
  | "수동 예약"
  | "웹앱 예약 취소"
  | "수동 예약 취소"
  | "입장 완료"
  | "미참석 처리";

/**
 * 계약 SessionRosterOperationalEvent — 최신 로그 한 줄.
 *
 * ★ `label` 은 **서버가 정한 문구**다 (웹앱 예약 / 수동 예약 / 웹앱 예약 취소 /
 *   수동 예약 취소 / 입장 완료 / 미참석 처리). 화면이 type+actor 로 다시 지어내지 않는다 —
 *   같은 CREATED 라도 주체에 따라 문구가 갈리는 규칙이 서버에 있다.
 */
export interface SessionRosterOperationalEvent {
  eventId: string;
  type: RosterOperationalEventType;
  actorType: AuditActorType;
  label: RosterOperationalEventLabel;
  occurredAt: string;
}

/**
 * 계약 SessionRosterBookingHistoryReference — 이 행의 이력이 걸쳐 있는 가족 예약들.
 *
 * 취소 뒤 재예약이면 항목이 여럿이다(집계가 새로 생기므로). 목록을 그릴 때 미리 읽지
 * 않는다 — `eventsPath` 는 열었을 때 부를 곳을 서버가 알려 주는 포인터일 뿐이다.
 */
export interface SessionRosterBookingHistoryReference {
  familyBookingId: string;
  status: FamilyBookingStatus;
  /** 지금 그 행이 대표로 보여 주는 집계인지. */
  current: boolean;
  eventsPath: string;
  createdAt: string;
  cancelledAt: string | null;
}

/**
 * 계약 SessionRosterRow — 그 회차의 **예약과 연결된 재원·비재원 참가자**.
 *
 * ★ 서버가 페이지네이션 전에 booked-only 범위를 적용하므로 예약 없는 재원생은 오지
 *   않는다. `booking` nullable 표현은 방어적 호환을 위해 유지한다. 재원생은 모/부 전체 연락처,
 *   비재원생은 `guestContact` 만 온다(반대쪽은 언제나 null). 전부 ADMIN 전용 민감 필드다 —
 *   저장·로깅 금지.
 */
export interface SessionRosterRow {
  rosterEntryId: string;
  participantType: BookingParticipantType;
  studentId: string | null;
  familyBookingStudentId: string | null;
  sourceStudentNo: string;
  name: string;
  branch: Branch;
  representativeClassName: string;
  /** 수학 정규반 이름 — 배정이 없으면 null. AdminStudent 와 같은 필드다(서버가 회차 행에도 실어 준다). */
  mathClassName: string | null;
  /** 과학반 이름 목록 — 없으면 빈 배열. 대표 반과 별개의 실제 배정 목록이라 여러 개일 수 있다. */
  scienceClassNames: string[];
  schoolName: string | null;
  grade: string | null;
  unitName: RosterUnitName | null;
  primaryTeacher: string | null;
  /** ADMIN 전용 전체 번호 (ENROLLED). GUEST 는 null. */
  motherPhone: string | null;
  /** ADMIN 전용 전체 번호 (ENROLLED). GUEST 는 null. */
  fatherPhone: string | null;
  /** ADMIN 전용 전체 번호 (GUEST). ENROLLED 는 null. */
  guestContact: string | null;
  booking: SessionRosterBookingProjection | null;
  latestOperationalEvent: SessionRosterOperationalEvent | null;
  bookingHistory: SessionRosterBookingHistoryReference[];
}

/**
 * 계약 SessionRosterFacets — 담임 선택지의 출처.
 * 회차 범위와 분원에만 좌우되고 단위·검색 필터에는 흔들리지 않는다(서버 주석 그대로).
 */
export interface SessionRosterFacets {
  /** 이미 정규화된 대표 담임(원본 콤마 목록의 첫 이름)이다 — 다시 자르지 않는다. */
  teachers: string[];
  unmatchedUnitCount: number;
}

/**
 * 현재 예약 명단 필터 범위의 참석 규모. 형제자매는 학생 행에는 각각 나타나지만 가족 예약은
 * 한 번만 세고, 실제 참가자는 참석 학부모(모·부 1명, 모/부 2명) 수로 센다.
 */
export interface ParticipationMonitoring {
  studentCount: number;
  familyBookingCount: number;
  attendeeCount: number;
}

export interface SessionRosterPage {
  items: SessionRosterRow[];
  page: PageMeta;
  facets: SessionRosterFacets;
  monitoring: ParticipationMonitoring;
}

export type BookingAuditEventType =
  | "CREATED"
  | "UPDATED"
  | "CANCELLED"
  | "QR_ISSUED"
  | "QR_ROTATED"
  | "QR_REVOKED"
  | "CHECKED_IN"
  | "MARKED_NO_SHOW";

export const BOOKING_AUDIT_EVENT_LABELS: Record<BookingAuditEventType, string> = {
  CREATED: "예약 생성",
  UPDATED: "예약 변경",
  CANCELLED: "예약 취소",
  QR_ISSUED: "QR 발급",
  QR_ROTATED: "QR 재발급",
  QR_REVOKED: "QR 폐기",
  CHECKED_IN: "입장 완료",
  MARKED_NO_SHOW: "미참석 처리",
};

export type AuditActorType = "ADMIN" | "SCANNER" | "PUBLIC_PROOF" | "SYSTEM";

export const AUDIT_ACTOR_TYPE_LABELS: Record<AuditActorType, string> = {
  ADMIN: "관리자",
  SCANNER: "스캐너",
  PUBLIC_PROOF: "학부모 본인 인증",
  SYSTEM: "시스템",
};

/**
 * 계약 AuditActor — `type` 만 언제나 있고 신원 두 필드는 nullable 이다.
 * SYSTEM 이 일으킨 이벤트에는 사람이 없으므로 이름을 지어내지 않는다.
 */
export interface AuditActor {
  type: AuditActorType;
  subjectId: string | null;
  displayName: string | null;
}

/**
 * 계약 SafeAuditMetadata — 허용 목록 기반 스칼라 맵이다.
 * QR·OTP·페어링·proof 원문, 전체 연락처, 비밀번호는 계약상 여기 들어오지 않는다.
 */
export type SafeAuditMetadata = Record<string, string | number | boolean | null>;

/**
 * 계약 BookingCancellationType — 취소 이벤트가 어떤 갈래로 일어났는지.
 *
 * 관리자 취소 세 갈래(PHONE·TEACHER·OTHER)에 학부모 **본인 취소**(SELF_SERVICE)가 더해진
 * 감사용 전체 집합이다. 요청 본문 enum(AdminCancellationType)은 관리자만 고르므로 SELF_SERVICE 를
 * 넣지 않는다 — 그쪽은 그대로 두고, 여기만 본인 취소를 포함한 상위 집합으로 둔다.
 */
export type BookingCancellationType = "SELF_SERVICE" | AdminCancellationType;

export const BOOKING_CANCELLATION_TYPE_LABELS: Record<BookingCancellationType, string> = {
  SELF_SERVICE: "본인취소",
  PHONE: ADMIN_CANCELLATION_TYPE_LABELS.PHONE,
  TEACHER: ADMIN_CANCELLATION_TYPE_LABELS.TEACHER,
  OTHER: ADMIN_CANCELLATION_TYPE_LABELS.OTHER,
};

/**
 * 계약 BookingAuditEvent (additionalProperties:false) — append-only 다.
 * 사유는 `reason` 최상위 필드다 (metadata 안이 아니다).
 *
 * `cancellationType` 은 취소 갈래를 담은 필수·nullable 필드다 — CANCELLED 가 아닌 이벤트는
 * null 이다. 화면은 이 타입 필드로만 취소 갈래를 말하고, reason·metadata 로 추정하지 않는다.
 */
export interface BookingAuditEvent {
  eventId: string;
  /** 계약 AuditSequence — bigint 정밀도를 지키려고 **문자열**로 온다. 숫자로 바꾸지 않는다. */
  sequence: string;
  familyBookingId: string;
  type: BookingAuditEventType;
  actor: AuditActor;
  reason: string | null;
  cancellationType: BookingCancellationType | null;
  metadata: SafeAuditMetadata;
  occurredAt: string;
}

/** 계약 EventPageMeta — 커서 페이지네이션이다(page/pageSize 아님). */
export interface EventPageMeta {
  nextAfterSequence: string | null;
  hasMore: boolean;
}

export interface BookingAuditEventPage {
  items: BookingAuditEvent[];
  page: EventPageMeta;
}

/** 감사 주체를 한 줄로 — 이름이 없으면 역할만 말한다. */
export function auditActorLabel(actor: AuditActor): string {
  const role = AUDIT_ACTOR_TYPE_LABELS[actor.type];
  return actor.displayName === null ? role : `${role} · ${actor.displayName}`;
}

export interface QrCredentialMetadata {
  credentialId: string;
  familyBookingId: string;
  version: number;
  status: QrCredentialStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface QrRotationRequest {
  reason: string;
}

export interface FreshQrRotation {
  credential: QrCredentialMetadata;
  replayed: false;
  qrToken: string;
}

export interface ReplayedQrRotation {
  credential: QrCredentialMetadata;
  replayed: true;
}

export type QrRotationResult = FreshQrRotation | ReplayedQrRotation;



/** 계약 PublicSurveyResponseCreateRequest — 별점(필수)과 후기(선택)만 받는다. */
export interface PublicSurveyResponseCreateRequest {
  rating: number;
  comment?: string;
}

/* ── 관리자 설문 응답 (tag: Admin seminars) ─────────────────────────────── */

/**
 * 계약 SurveyParticipantContext — 한 설문 응답의 **대표 참가자 + 가족 맥락**(ADMIN 전용).
 * 서버가 예약 시점 스냅샷/현재 재원 정보로 대표 참가자를 골라 준다.
 *
 * ★ nullable 은 계약 그대로다: 재학생이 아닌 GUEST 는 `studentId` 가 null, 단위 규칙에 안 맞으면
 *   `unitName` 이 null, 수학 담임이 없는 과학 전용 학생은 `teacherName` 이 null 이다(화면은 —로).
 * ★ `contact` 는 정규화된 **전체** 연락처 숫자열(8~15자리)이다 — 표기는 `fmtPhone` 로만 한다.
 */
export interface SurveyParticipantContext {
  participantType: BookingParticipantType;
  /** ENROLLED 면 학생 식별자, GUEST 면 null. */
  studentId: string | null;
  sourceStudentNo: string;
  branch: Branch;
  /** 단위(초등·중1…). 단위 규칙에 안 맞으면 null. */
  unitName: string | null;
  studentName: string;
  className: string;
  /** 수학 담임. 과학 전용 등 담임이 없으면 null. */
  teacherName: string | null;
  /** ADMIN 전용 정규화 연락처(숫자열). */
  contact: string;
  participantCount: number;
  /** participantCount - 1. */
  additionalParticipantCount: number;
}

/**
 * 계약 SurveyResponse — 관리자 목록이 주는 응답. `participant` 로 캠퍼스·단위·학생·반·담임·
 * 학부모 연락처까지 함께 온다(POC 만족도 표의 8열이 여기서 나온다).
 */
export interface SurveyResponse {
  surveyResponseId: string;
  familyBookingId: string;
  participant: SurveyParticipantContext;
  rating: number;
  comment: string | null;
  submittedAt: string;
}

/** 계약 SurveyRatingDistribution — 키는 별점 문자열 1~5 다. */
export type SurveyRatingDistribution = Record<"1" | "2" | "3" | "4" | "5", number>;

/** 서버가 센 회차 전체 집계다 — 한 페이지에서 클라이언트가 다시 계산하지 않는다. */
export interface SurveyResponseSummary {
  /** 응답이 없으면 null — 0 이 아니다. 0.0 점으로 그리지 않는다. */
  averageRating: number | null;
  responseCount: number;
  ratingDistribution: SurveyRatingDistribution;
}

export interface AdminSurveyResponsePage {
  items: SurveyResponse[];
  page: PageMeta;
  summary: SurveyResponseSummary;
}

export interface SurveyResponseMutationResult {
  surveyResponseId: string;
  familyBookingId: string;
  seminarSessionId: string;
  rating: number;
  comment: string | null;
  submittedAt: string;
  replayed: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 문자 (tag: Admin SMS).
 *
 * 계약이 확정됐다 — 아래 타입은 openapi.yaml 의 SMS 스키마를 그대로 옮긴 것이다.
 * 서버가 변수 치환·바이트 분류·배치 집계를 모두 하므로, 화면은 여기 오는 값을 세지 않고
 * 그대로 읽는다. 연락처는 어떤 필드로도 평문이 오지 않는다 (`***-****-1234` 뿐).
 * ──────────────────────────────────────────────────────────────────────────── */

export type SmsPurpose =
  | "OTP"
  | "BOOKING_CONFIRMED"
  | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED"
  | "FIRST_CHECK_IN"
  | "ADMIN_GROUP"
  | "SURVEY";

export type SmsMessageType = "SMS" | "LMS";

/** 계약 SmsDeliveryStatus. CLAIMED·SENDING 은 워커가 집어 든 중간 상태다. */
export type SmsDeliveryStatus =
  | "PENDING"
  | "CLAIMED"
  | "SENDING"
  | "SENT"
  | "BLOCKED_DISABLED"
  | "BLOCKED_ALLOWLIST"
  | "FAILED_PERMANENT"
  | "DELIVERY_UNKNOWN"
  | "DEAD";

/** 수신 대상 4종 (명세 §5.2) — 서버가 전부 지원한다. */
export type SmsAudience =
  | "BOOKED_FAMILIES"
  | "RESERVED_FAMILIES"
  | "CHECKED_IN_FAMILIES"
  | "CANCELLED_FAMILIES"
  /** 테스트 예약만. 다른 모든 대상에서는 테스트 예약이 제외된다. */
  | "TEST_ACCOUNTS";

/** 명세 §5.2 의 그룹 이름 그대로 — 확인 대화상자가 이 문구를 그대로 읽어 준다. */
export const SMS_AUDIENCE_LABELS: Record<SmsAudience, string> = {
  BOOKED_FAMILIES: "예약자 전체",
  RESERVED_FAMILIES: "미체크만",
  CHECKED_IN_FAMILIES: "입장 완료",
  CANCELLED_FAMILIES: "취소자",
  TEST_ACCOUNTS: "테스트 계정",
};

export const SMS_AUDIENCE_OPTIONS: ReadonlyArray<{ value: SmsAudience; label: string }> = [
  { value: "BOOKED_FAMILIES", label: SMS_AUDIENCE_LABELS.BOOKED_FAMILIES },
  { value: "RESERVED_FAMILIES", label: SMS_AUDIENCE_LABELS.RESERVED_FAMILIES },
  { value: "CHECKED_IN_FAMILIES", label: SMS_AUDIENCE_LABELS.CHECKED_IN_FAMILIES },
  { value: "CANCELLED_FAMILIES", label: SMS_AUDIENCE_LABELS.CANCELLED_FAMILIES },
  // 맨 오른쪽 — 실제 가족에게 닿지 않고 발송 경로만 확인하는 대상이다.
  { value: "TEST_ACCOUNTS", label: SMS_AUDIENCE_LABELS.TEST_ACCOUNTS },
];

/**
 * 계약 SmsGatewayReadiness — 시크릿이 아닌 플래그만 온다.
 *
 * `adapterAvailable` 은 HTTP API 프로세스에서 **항상 false** 다 (provider 어댑터가 워커에
 * 격리돼 있다). `workerOnly` 는 계약상 const true. 따라서 이 둘도, `configured` 도 발송
 * 가능 여부가 아니다 — 기능이 꺼진 `enabled:false` 만 발송 불가다.
 */
export interface SmsGatewayReadiness {
  enabled: boolean;
  configured: boolean;
  allowlistEnabled: boolean;
  testMode: boolean;
  adapterAvailable: boolean;
  workerOnly: boolean;
}

/** 계약 SmsPayloadClassification — 서버가 NFC 정규화 + EUC-KR 로 센 값이 유일한 진실이다. */
export interface SmsPayloadClassification {
  messageType: SmsMessageType;
  messageBytes: number;
  titleBytes: number | null;
}

/** 계약 SmsTemplate. `version` 은 낙관적 잠금용 10진 문자열이다 — 숫자로 바꾸지 않는다. */
export interface SmsTemplate {
  templateId: string;
  key: string;
  name: string;
  purpose: SmsPurpose;
  title: string | null;
  body: string;
  active: boolean;
  /** 용도(purpose)별로 활성 기본 템플릿이 정확히 하나 유지된다. */
  isDefault: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmsTemplateList {
  items: SmsTemplate[];
}

/** 계약 SmsTemplateCreated — 생성 응답만 classification 을 함께 준다. */
export interface SmsTemplateCreated extends SmsTemplate {
  classification: SmsPayloadClassification;
}

/**
 * 계약 SmsTemplateRemovalDisposition — DELETE 결과가 하드 삭제였는지 보관이었는지.
 * `DELETED` 는 사용 이력이 없어 행이 사라졌다는 뜻, `ARCHIVED` 는 이력이 있어 inactive 로 남겼다는 뜻.
 */
export type SmsTemplateRemovalDisposition = "DELETED" | "ARCHIVED";

/**
 * 계약 SmsTemplateRemovalResult — DELETE /admin/sms/templates/{templateId} 응답.
 *
 * `archivedTemplate` 는 `disposition:"ARCHIVED"` 일 때만 채워지고(그때 inactive 행), 하드 삭제면 null 이다.
 * `usageCount` 는 이 템플릿을 참조하는 durable outbox 스냅샷 수다 — 0 이면 삭제, 그 외엔 보관된다.
 */
export interface SmsTemplateRemovalResult {
  templateId: string;
  disposition: SmsTemplateRemovalDisposition;
  usageCount: number;
  archivedTemplate: SmsTemplate | null;
}

/**
 * 계약 SmsRenderedSample — 수신자 한 명에게 **실제로 나갈** 본문이다.
 * 변수는 서버가 이미 치환했고 바이트/타입도 그 결과를 잰 값이다.
 */
export interface SmsRenderedSample {
  familyBookingId: string;
  maskedRecipient: string;
  message: string;
  title: string | null;
  messageType: SmsMessageType;
  messageBytes: number;
  titleBytes: number | null;
}

/**
 * 계약 SmsTargetPreview.
 *
 * `messageTemplate` 은 치환 **전** 원문이고, 실제로 나갈 문장은 `samples` 에 있다.
 * `maximum*` 은 수신자 전체에서의 최댓값이며 수신자가 0 명이면 전부 null 이다 —
 * 그때 0 이나 "SMS" 로 채우지 않는다.
 */
export interface SmsTargetPreview {
  branch: Branch;
  seminarSessionId: string;
  audience: SmsAudience;
  /** 서버가 센 권위 있는 대상 수 — 화면이 다시 세지 않는다. */
  recipientCount: number;
  /** 발송 때 그대로 되돌려 보내야 하는 토큰. */
  previewToken: string;
  /** 최대 10건, 전부 마스킹돼서 온다. */
  maskedRecipients: string[];
  /** 직접 입력이면 null. */
  templateId: string | null;
  /** 직접 입력이면 서버가 "직접 입력" 을 넣어 준다 — 항상 값이 있다. */
  templateName: string;
  messageTemplate: string;
  titleTemplate: string | null;
  /** 최대 10건. 수신자가 0 명이면 빈 배열이다. */
  samples: SmsRenderedSample[];
  maximumMessageType: SmsMessageType | null;
  maximumMessageBytes: number | null;
  maximumTitleBytes: number | null;
}

/** 계약 SmsEnqueueAccepted (202). */
export interface SmsEnqueueAccepted {
  batchId: string;
  queuedCount: number;
  previewToken: string;
  status: "QUEUED";
  source: "ADMIN_GROUP" | "SURVEY";
  templateId: string | null;
  templateName: string;
}

/** 계약 SmsMessageSummary — 수신자별 1행. 본문·전체 연락처는 계약이 의도적으로 뺐다. */
export interface SmsMessageSummary {
  messageId: string;
  /** 배치에 속하지 않는 자동 발송(OTP 등)이면 null. */
  batchId: string | null;
  source: SmsPurpose;
  branch: Branch;
  seminarSessionId: string | null;
  familyBookingId: string | null;
  templateId: string | null;
  templateName: string | null;
  audience: SmsAudience | null;
  /** 항상 `***-****-1234` 형태 — 원본 번호는 서버를 떠나지 않는다. */
  maskedRecipient: string;
  messageType: SmsMessageType;
  messageBytes: number;
  status: SmsDeliveryStatus;
  attemptCount: number;
  providerMessageId: string | null;
  providerResultCode: number | null;
  lastErrorCode: string | null;
  actorSubject: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SmsBatchStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED";

/**
 * 계약 SmsBatchSummary — **배치 집계의 유일한 진실**이다.
 *
 * 서버가 SQL 로 센 값이라 화면이 items 를 다시 묶어 세면 안 된다 (같은 건을 두 번 센다).
 * `pendingCount` 는 PENDING·CLAIMED·SENDING, `failureCount` 는 차단·영구실패·미상·DEAD 를 포함한다.
 */
export interface SmsBatchSummary {
  batchId: string;
  source: "ADMIN_GROUP" | "SURVEY";
  templateId: string | null;
  templateName: string;
  audience: SmsAudience;
  seminarSessionId: string;
  branch: Branch;
  recipientCount: number;
  successCount: number;
  failureCount: number;
  pendingCount: number;
  status: SmsBatchStatus;
  actorSubject: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 계약 SmsMessageList — 배치 집계와 수신자별 행을 함께 준다. */
export interface SmsMessageList {
  batches: SmsBatchSummary[];
  items: SmsMessageSummary[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * 공개 포스터 (계약 tags: Public poster / Admin poster).
 * GET /public/poster (same-origin, 항상 200) · PUT /admin/poster (multipart).
 * 서버가 이미지 내용의 sha256 을 버전으로 삼아 불변 URL 로 서빙한다 — 폭·높이 메타데이터는 없다.
 * ──────────────────────────────────────────────────────────────────────────── */

/** 계약 poster mediaType — 정확히 이 셋만 허용한다(그 밖은 계약상 오지 않는다). */
export type PosterMediaType = "image/png" | "image/jpeg" | "image/webp";

/**
 * 계약 PosterDescriptor — 현재 게시된 포스터의 서술자.
 *
 * - `version` 은 이미지 내용의 sha256(64 소문자 hex)이다.
 * - `imageUrl` 은 그 버전을 가리키는 **불변 same-origin 경로**
 *   `/api/v1/public/poster/image/<64 hex>` 다. 버전이 곧 URL 이라 캐시 무효화가 필요 없다.
 * - 폭·높이 메타데이터가 없으므로 화면은 자연 비율의 반응형 네이티브 이미지로 그린다.
 */
export interface PosterDescriptor {
  version: string;
  imageUrl: string;
  mediaType: PosterMediaType;
  sizeBytes: number;
  updatedAt: string;
}

/**
 * 계약 PosterResource — GET /public/poster 와 PUT /admin/poster 성공 응답의 봉투.
 * 게시된 포스터가 없으면 `poster: null`(공개 GET 은 이 경우에도 200)이고, 있으면 서술자다.
 */
export interface PosterResource {
  poster: PosterDescriptor | null;
}
