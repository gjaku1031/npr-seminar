/**
 * 계약(packages/contracts/openapi.yaml) 타입 재선언 — 인증 + 스캐너 + 공개 학부모 예약
 * `apps/api` 를 import 하지 않기 위해 여기서 다시 씀 — 계약이 단일 진실임
 */

/* ── 인증 · 프로젝트 세션 ────────────────────────────────────────────────── */

/**
 * 계약 ActorRole — 콘솔은 ADMIN 만 들어옴. SCANNER 는 스캐너 화면 전용임
 */
export type ActorRole = "ADMIN" | "SCANNER";

/**
 * 계약 CurrentActor (GET /api/v1/auth/me)
 *
 * `deviceId` 는 SCANNER 에만 있음. 만료 시각 두 개는 세션 수명이지 권한이 아님 —
 * 권한 판정은 언제나 `role` 로 함
 */
export interface CurrentActor {
  /**
   * 주체 ID
   */
  subjectId: string;

  /**
   * 권한 역할
   */
  role: ActorRole;

  /**
   * 표시 이름
   */
  displayName: string;

  /**
   * 스캐너 기기 ID
   */
  deviceId: string | null;

  /**
   * 유휴 만료 시각
   */
  idleExpiresAt: string;

  /**
   * 절대 만료 시각
   */
  absoluteExpiresAt: string;
}

/**
 * 계약 LoginRequest (POST /api/v1/auth/login)
 * 값은 시크릿임 — 저장·로깅·URL 노출이 금지됨
 */
export interface LoginRequest {
  /**
   * 로그인 ID
   */
  username: string;

  /**
   * 비밀번호
   */
  password: string;
}

/**
 * 계약 Branch. A·B·C 캠퍼스
 */
export type Branch = "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C";

/**
 * 캠퍼스 짧은 표시 이름. 관리자 화면용
 */
export const BRANCH_LABELS: Record<Branch, string> = {
  CAMPUS_A: "A",
  CAMPUS_B: "B",
  CAMPUS_C: "C",
};

/**
 * 캠퍼스 선택 목록. 관리자 화면용
 */
export const BRANCH_OPTIONS: ReadonlyArray<{ value: Branch; label: string }> = [
  { value: "CAMPUS_A", label: BRANCH_LABELS.CAMPUS_A },
  { value: "CAMPUS_B", label: BRANCH_LABELS.CAMPUS_B },
  { value: "CAMPUS_C", label: BRANCH_LABELS.CAMPUS_C },
];

/**
 * 계약 enum
 * - ACTIVE: 페어링돼 사용 중
 * - REVOKED: 관리자가 해제 (REVOKED_BY_ADMIN)
 * - UNPAIRED: 기기가 스스로 해제 (UNPAIRED_BY_DEVICE). 둘 다 hard delete 가 아니라
 *   durable 상태 전이이며 출석·감사 이력은 보존됨
 */
export type ScannerDeviceStatus = "ACTIVE" | "REVOKED" | "UNPAIRED";

/**
 * 계약 ScannerDevice — PostgreSQL 소유 durable identity + Redis 파생 presence
 * 배터리 3필드는 nullable 이고 "미지원/미보고" 를 뜻함. 값을 추정하지 않음
 */
export interface ScannerDevice {
  /**
   * 스캐너 기기 ID
   */
  deviceId: string;

  /**
   * 기기 이름
   */
  deviceName: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 출입구 코드
   */
  gateCode: string;

  /**
   * 상태
   */
  status: ScannerDeviceStatus;

  /**
   * 페어링 시각
   */
  pairedAt: string;

  /**
   * 해제 시각
   */
  revokedAt: string | null;
  /**
   * 온라인 판정의 유일한 근거 — heartbeat 시각으로 재계산하지 않음
   */
  online: boolean;

  /**
   * 접속 표시 만료 시각
   */
  presenceExpiresAt: string | null;

  /**
   * 배터리 잔량(%). 모르면 null
   */
  lastBatteryLevelPercent: number | null;

  /**
   * 충전 중 여부. 모르면 null
   */
  isCharging: boolean | null;

  /**
   * 배터리 보고 시각
   */
  batteryReportedAt: string | null;
}

/**
 * 계약 PageMeta. 쪽 번호 기반 페이지 정보
 */
export interface PageMeta {
  /**
   * 현재 페이지 번호
   */
  page: number;

  /**
   * 페이지 크기
   */
  pageSize: number;

  /**
   * 전체 건수
   */
  totalItems: number;

  /**
   * 전체 페이지 수
   */
  totalPages: number;
}

/**
 * 계약 ScannerDevicePage. 스캐너 기기 목록 한 페이지
 */
export interface ScannerDevicePage {
  /**
   * 목록
   */
  items: ScannerDevice[];

  /**
   * 페이지 정보
   */
  page: PageMeta;
}

/**
 * 계약 회차 대상 범위. ALL은 전 지점, BRANCH는 한 지점
 */
export type SeminarSessionScope = "ALL" | "BRANCH";

/**
 * 계약 ScannerShiftLock. 기기가 잡은 회차 잠금
 */
export interface ScannerShiftLock {
  /**
   * 잠금 ID
   */
  lockId: string;

  /**
   * 스캐너 기기 ID
   */
  deviceId: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 출입구 코드
   */
  gateCode: string;

  /**
   * 회차 ID
   */
  seminarSessionId: string;

  /**
   * 회차 대상 범위
   */
  sessionScope: SeminarSessionScope;

  /**
   * 회차 지점. 전 지점 회차는 null
   */
  sessionBranch: Branch | null;

  /**
   * 잠근 시각
   */
  lockedAt: string;

  /**
   * 잠근 주체
   */
  lockedBy: string;
}

/**
 * 계약 ScannerShiftState. 기기의 회차 잠금 상태
 */
export interface ScannerShiftState {
  /**
   * 잠금 여부
   */
  locked: boolean;

  /**
   * 잠금 정보. 없으면 null
   */
  lock: ScannerShiftLock | null;
}

/**
 * 계약 ScannerDeviceDetail. 관리자가 보는 기기와 잠금 상태
 */
export interface ScannerDeviceDetail {
  /**
   * 스캐너 기기
   */
  device: ScannerDevice;

  /**
   * 회차 잠금 상태
   */
  shift: ScannerShiftState;
}

/**
 * 계약 ScannerCurrent. 스캐너 자신의 기기와 잠금 상태
 */
export interface ScannerCurrent {
  /**
   * 스캐너 기기
   */
  device: ScannerDevice;

  /**
   * 회차 잠금 상태
   */
  shift: ScannerShiftState;
}

/**
 * 계약 PairingCodeMetadata — 원문 코드는 여기 없음
 */
export interface PairingCodeMetadata {
  /**
   * 페어링 코드 ID
   */
  pairingCodeId: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 출입구 코드
   */
  gateCode: string;

  /**
   * 등록 예정 기기 이름
   */
  intendedDeviceName: string;

  /**
   * 만료 시각
   */
  expiresAt: string;
  /**
   * 계약상 상수 300 (5분)
   */
  ttlSeconds: number;
}

/**
 * 계약 PairingCodeCreateRequest. 페어링 코드 발급 요청
 */
export interface PairingCodeCreateRequest {
  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 출입구 코드
   */
  gateCode: string;

  /**
   * 등록 예정 기기 이름
   */
  intendedDeviceName: string;
}

/**
 * 신규 발급만 원문 코드를 줌. idempotency 리플레이는 코드를 생략함
 */
export interface FreshPairingCode {
  /**
   * 페어링 코드 정보
   */
  pairing: PairingCodeMetadata;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: false;

  /**
   * 페어링 코드 원문
   */
  pairingCode: string;
}

/**
 * 멱등 키 재요청으로 재생한 발급 결과. 원문 코드 없음
 */
export interface ReplayedPairingCode {
  /**
   * 페어링 코드 정보
   */
  pairing: PairingCodeMetadata;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: true;
}

/**
 * 페어링 코드 발급 결과. 신규 발급 또는 재생
 */
export type PairingCodeCreateResult = FreshPairingCode | ReplayedPairingCode;

/**
 * 원문 코드를 담은 신규 발급 결과인지 판별
 */
export function isFreshPairingCode(result: PairingCodeCreateResult): result is FreshPairingCode {
  return result.replayed === false;
}

/**
 * 계약 pattern: 혼동 문자(0,1,I,O)를 뺀 대문자 6자
 */
export const PAIRING_CODE_LENGTH = 6;

/**
 * 페어링 코드 형식 검사 정규식
 */
export const PAIRING_CODE_PATTERN = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

/**
 * 계약 PairingClaimRequest. 스캐너가 페어링 코드로 기기를 등록하는 요청
 */
export interface PairingClaimRequest {
  /**
   * 페어링 코드 원문
   */
  pairingCode: string;

  /**
   * 기기 이름
   */
  deviceName: string;

  /**
   * 클라이언트 플랫폼
   */
  clientPlatform: string;
}

/**
 * 계약 PairingClaimResponse. 등록된 기기와 새 세션 정보
 */
export interface PairingClaimResponse {
  /**
   * 스캐너 기기
   */
  device: ScannerDevice;
  /**
   * 재생성된 SCANNER 세션용 새 토큰 — 로그에 남기지 않음
   */
  csrfToken: string;
}

/**
 * 계약 ScannerHeartbeatRequest. 스캐너 접속 표시·배터리 보고
 */
export interface ScannerHeartbeatRequest {
  /**
   * 기기 시각
   */
  clientTime: string;
  /**
   * 미지원이면 null 또는 생략. 숫자를 추정하지 않음
   */
  batteryLevelPercent?: number | null;

  /**
   * 충전 중 여부. 모르면 null
   */
  isCharging?: boolean | null;
}

/**
 * 계약 ScannerHeartbeatResponse. 서버 시각과 접속 표시 만료 시각
 */
export interface ScannerHeartbeatResponse {
  /**
   * 서버 시각
   */
  serverTime: string;

  /**
   * 접속 표시 만료 시각
   */
  presenceExpiresAt: string;
}

/**
 * 계약 ScannerShiftLockRequest. 스캔할 회차 잠금 요청
 */
export interface ScannerShiftLockRequest {
  /**
   * 회차 ID
   */
  seminarSessionId: string;
}

/**
 * 계약 ShiftReleaseRequest. 관리자의 회차 잠금 강제 해제 요청
 */
export interface ShiftReleaseRequest {
  /**
   * 사유
   */
  reason: string;
}

/**
 * 계약 DeviceRevocationRequest. 관리자의 기기 해제 요청
 */
export interface DeviceRevocationRequest {
  /**
   * 사유
   */
  reason: string;
}

/**
 * 계약 enum — NOT_OPEN(예약 시작 전)과 CLOSED(예약 마감)를 구분함
 */
export type PublicAvailability = "AVAILABLE" | "NOT_OPEN" | "CLOSED";

/**
 * 공개 예약 가능 상태 표시 문구
 */
export const AVAILABILITY_LABELS: Record<PublicAvailability, string> = {
  AVAILABLE: "예약 가능",
  NOT_OPEN: "예약 시작 전",
  CLOSED: "예약 마감",
};

/**
 * 계약 PublicSeminarSession (additionalProperties:false — 필드명을 그대로 따름)
 */
export interface PublicSeminarSession {
  /**
   * 설명회 ID
   */
  seminarId: string;

  /**
   * 회차 ID
   */
  seminarSessionId: string;
  /**
   * 계약 필드명은 `seminarTitle` 임 (`title` 아님)
   */
  seminarTitle: string;

  /**
   * 대상 범위. 전 지점·한 지점
   */
  scope: SeminarSessionScope;
  /**
   * scope 가 ALL 이면 정확히 null, BRANCH 면 정확히 구체 지점
   */
  branch: Branch | null;

  /**
   * 시작 시각
   */
  startsAt: string;

  /**
   * 종료 시각
   */
  endsAt: string;

  /**
   * 장소
   */
  location: string;

  /**
   * 예약 시작 시각
   */
  bookingOpensAt: string;

  /**
   * 예약 마감 시각
   */
  bookingClosesAt: string;
  /**
   * 계약 필수 필드 — 이 회차에서 재원생이 없는 연락처(비재원)가 guest 흐름을 쓸 수 있는지
   * 첫 화면 비재원 진입 가능 여부, 회차 선택 가능 여부, 생성 API 최종 검사의 권위임
   */
  guestBookingEnabled: boolean;

  /**
   * 예약 가능 상태
   */
  availability: PublicAvailability;
}

/**
 * 계약 ScannerSessionList. 스캐너가 고를 수 있는 회차와 현재 잠금 상태
 */
export interface ScannerSessionList {
  /**
   * 목록
   */
  items: PublicSeminarSession[];

  /**
   * 회차 잠금 상태
   */
  shift: ScannerShiftState;
}

/**
 * 계약 CheckInResult. 체크인 결과 종류
 */
export type CheckInResult =
  | "CHECKED_IN"
  /**
   * 입장도 실패도 아님. QR·회차·예약 상태는 이미 유효한데 2명 예약이라 실제 온 인원을
   * 알려 주지 않았을 뿐임 — 서버는 아무것도 바꾸지 않음. 스캐너가 스태프에게 묻고
   * attendedCount 를 실어 다시 부름
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
 * 계약 CheckInRepresentativeStudent — 체크인 확인 문구에 쓰는 대표(최고학년) 학생 스냅샷
 * 동학년은 캠퍼스·단위·반·이름·학번 순으로 정해짐. schoolName/grade/unitName 은 nullable
 */
export interface CheckInRepresentativeStudent {
  /**
   * 참여 유형. 재원생·비재원생
   */
  participantType: BookingParticipantType;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 학생 이름
   */
  studentName: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 반
   */
  className: string;

  /**
   * 학교
   */
  schoolName: string | null;

  /**
   * 학년
   */
  grade: string | null;

  /**
   * 단위
   */
  unitName: string | null;
}

/**
 * 계약 CheckInOutcome. QR·수동 체크인 결과
 */
export interface CheckInOutcome {
  /**
   * 이벤트 ID
   */
  eventId: string;

  /**
   * 결과
   */
  result: CheckInResult;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: boolean;

  /**
   * 가족 예약 ID
   */
  familyBookingId: string | null;

  /**
   * 예약 인원
   */
  familySeatCount: 1 | 2 | null;
  /**
   * 이 입장이 기록한 인원. CHECKED_IN·ALREADY_CHECKED_IN 에서만 값이 있음
   */
  attendedCount: number | null;
  /**
   * 가족 참석 학부모 — 예약을 못 찾으면 null. 스캐너 확인 문구에 그대로 씀
   */
  attendanceParty: AttendanceParty | null;
  /**
   * 대표(최고학년) 학생 이름 — 확인 문구 전용. 예약을 못 찾으면 null
   */
  representativeStudentName: string | null;
  /**
   * 대표 학생 스냅샷 — 예약을 못 찾으면 null
   */
  representativeStudent: CheckInRepresentativeStudent | null;

  /**
   * 회차 ID
   */
  seminarSessionId: string;

  /**
   * 스캐너 기기 ID
   */
  deviceId: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 출입구 코드
   */
  gateCode: string;

  /**
   * 발생 시각
   */
  occurredAt: string;
}

/**
 * 계약 enum. 좌석 수는 서버가 파생함 (x-server-seat-count: MOTHER 1 / FATHER 1 / BOTH 2)
 */
export type AttendanceParty = "MOTHER" | "FATHER" | "BOTH";

/**
 * 숫자패드 오타만 막는 상한 — 정책이 아님. 서버 DB 제약과 같은 값이어야 함
 */
export const MAX_ATTENDED_COUNT = 20;

/**
 * 참석 보호자 짧은 표시 문구
 */
export const ATTENDANCE_PARTY_LABELS: Record<AttendanceParty, string> = {
  MOTHER: "모",
  FATHER: "부",
  BOTH: "모/부",
};

/**
 * 사용자 노출 참석 학부모 요약 문구 — "모 · 1명" / "부 · 1명" / "모/부 · 2명" 으로 통일함
 * 선택 버튼·티켓·예약 요약·스캐너 후보 등 모든 노출 지점이 이 helper 하나만 씀(중복 금지)
 * 인원은 서버 좌석 파생(MOTHER 1 / FATHER 1 / BOTH 2)과 동일함
 */
export function attendancePartySummary(party: AttendanceParty): string {
  return `${ATTENDANCE_PARTY_LABELS[party]} · ${party === "BOTH" ? 2 : 1}명`;
}

/**
 * 계약 FamilyBookingStatus. 가족 예약 상태
 */
export type FamilyBookingStatus = "RESERVED" | "CHECKED_IN" | "CANCELLED" | "NO_SHOW";

/**
 * 가족 예약 상태 표시 문구
 */
export const FAMILY_BOOKING_STATUS_LABELS: Record<FamilyBookingStatus, string> = {
  RESERVED: "예약",
  CHECKED_IN: "입장 완료",
  CANCELLED: "취소됨",
  NO_SHOW: "미참석",
};

/**
 * 계약 참여 유형. ENROLLED는 재원생, GUEST는 비재원생
 */
export type BookingParticipantType = "ENROLLED" | "GUEST";

/**
 * 계약 예약 경로. 웹·전화·선생님·현장
 */
export type BookingSource = "WEB_APP" | "PHONE" | "TEACHER" | "ON_SITE";

/**
 * 계약 QR 자격 증명 상태
 */
export type QrCredentialStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

/**
 * 계약 FamilyBookingStudentSnapshot — 예약 시점의 참가자 스냅샷
 * GUEST 는 studentId=null 이고 `비재원-` 로 시작하는 합성 sourceStudentNo 를 가짐
 * (내부 값이라 화면에 노출하지 않음). QR·상태·좌석 수는 가족 집계의 몫임
 */
export interface FamilyBookingStudentSnapshot {
  /**
   * 예약 학생 ID
   */
  familyBookingStudentId: string;

  /**
   * 참여 유형. 재원생·비재원생
   */
  participantType: BookingParticipantType;

  /**
   * 학생 ID
   */
  studentId: string | null;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 이름
   */
  name: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 대표 반 이름
   */
  representativeClassName: string | null;

  /**
   * 학교
   */
  schoolName: string | null;

  /**
   * 학년
   */
  grade: string | null;

  /**
   * 단위
   */
  unitName: string | null;

  /**
   * 담임
   */
  teacherName: string | null;
}

/**
 * 계약 ManualCheckInCandidate. 수동 체크인 후보 한 건
 */
export interface ManualCheckInCandidate {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;
  /**
   * 스캐너 경로는 의도적으로 마스킹을 유지함 — 관리자 응답이 전체 연락처로 바뀐
   * 뒤에도 여기는 그대로임. 현장 태블릿은 공용 화면이라 전체 번호를 띄우지 않음
   */
  maskedContact: string;

  /**
   * 참석 보호자
   */
  attendanceParty: AttendanceParty;

  /**
   * 예약 인원
   */
  seatCount: 1 | 2;

  /**
   * 상태
   */
  status: FamilyBookingStatus;

  /**
   * 참가 학생
   */
  students: FamilyBookingStudentSnapshot[];
}

/**
 * 계약 ManualCheckInCandidateList. 수동 체크인 후보 목록
 */
export interface ManualCheckInCandidateList {
  /**
   * 목록
   */
  items: ManualCheckInCandidate[];
}

/**
 * 계약 QrCheckInRequest. QR 체크인 요청
 */
export interface QrCheckInRequest {
  /**
   * QR 원문 토큰
   */
  qrToken: string;
}

/**
 * 계약 ManualCheckInRequest. 수동 체크인 요청
 */
export interface ManualCheckInRequest {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 공개 학부모 예약 (tags: Public OTP / Public seminar sessions / Public students /
 * Public family bookings). 전부 계약 그대로 다시 선언함 — apps/api 를 import 하지 않음
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 OtpPurpose. 신규 예약 또는 예약 관리
 */
export type OtpPurpose = "FAMILY_BOOKING" | "BOOKING_MANAGE";

/**
 * 계약 BookingProofScope. 예약 증명으로 허용하는 작업 범위
 */
export type BookingProofScope = "STUDENT_SEARCH" | "FAMILY_BOOKING" | "BOOKING_READ" | "BOOKING_MANAGE";

/**
 * 계약 OtpChallengeRequest — purpose 로 갈리는 판별 유니언
 * - FAMILY_BOOKING: `branch` 필수. 선택 캠퍼스가 proof 에 귀속돼 재원생 자동 연결과 guest 정책을 정함
 * - BOOKING_MANAGE: `branch` 를 보내지 않음. 서버가 소유 예약 스냅샷에서 SMS 경로를 파생함
 *
 * 학부모 연락처(모 또는 부)는 서버가 8~15자리로 정규화함. 로깅 금지
 */
export type OtpChallengeRequest =
  | { contact: string; purpose: "FAMILY_BOOKING"; branch: Branch }
  | { contact: string; purpose: "BOOKING_MANAGE" };

/**
 * 계약 OtpChallengeAccepted. 인증번호 발송 접수 결과
 */
export interface OtpChallengeAccepted {
  /**
   * OTP 챌린지 ID
   */
  challengeId: string;

  /**
   * 만료 시각
   */
  expiresAt: string;
  /**
   * 계약상 상수 60
   */
  retryAfterSeconds: number;
}

/**
 * 계약 OtpVerifyRequest. 인증번호 확인 요청
 */
export interface OtpVerifyRequest {
  /**
   * 6자리 인증번호
   */
  oneTimeCode: string;
}

/**
 * 신선한 검증만 원문 proof 를 줌
 */
export interface FreshOtpProofIssued {
  /**
   * 예약 증명 원문
   */
  bookingProof: string;

  /**
   * 만료 시각
   */
  expiresAt: string;

  /**
   * 증명 권한 범위
   */
  scopes: BookingProofScope[];

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: false;
}

/**
 * idempotency 리플레이 — 원문 proof 가 없음. 잃어버린 proof 는 복구할 수 없음
 */
export interface ReplayedOtpProofIssued {
  /**
   * 만료 시각
   */
  expiresAt: string;

  /**
   * 증명 권한 범위
   */
  scopes: BookingProofScope[];

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: true;
}

/**
 * 예약 증명 발급 결과. 신규 발급 또는 재생
 */
export type OtpProofIssued = FreshOtpProofIssued | ReplayedOtpProofIssued;

/**
 * 증명 원문을 담은 신규 발급 결과인지 판별
 */
export function isFreshProof(result: OtpProofIssued): result is FreshOtpProofIssued {
  return result.replayed === false;
}

/**
 * 계약 RepresentativeResolution
 * - REGULAR: 정규 후보가 정확히 하나 — 그 반이 대표임
 * - SCIENCE_ALIAS: 정규 0 + 과학 1 이상 — `과학` 으로 표시됨
 * - MULTIPLE_REGULAR / NO_CLASS: 둘 다 모호(ambiguous)라 대표를 정할 수 없음
 */
export type RepresentativeResolution = "REGULAR" | "SCIENCE_ALIAS" | "MULTIPLE_REGULAR" | "NO_CLASS";

/**
 * 계약 RepresentativeClass. 학생의 대표 반 판정 결과
 */
export interface RepresentativeClass {
  /**
   * 대표 반 판정 결과
   */
  resolution: RepresentativeResolution;
  /**
   * 정확한 반, SCIENCE_ALIAS 면 `과학`, 모호하면 null
   */
  displayName: string | null;

  /**
   * 판정 불가 여부
   */
  ambiguous: boolean;

  /**
   * 정규 반 후보 수
   */
  regularCandidateCount: number;

  /**
   * 과학 반 후보 수
   */
  scienceCandidateCount: number;

  /**
   * 대표로 선택된 수강 등록 키. 없으면 null
   */
  selectedSourceAssignmentKey: string | null;
}

/**
 * 계약 PublicStudent. 공개 예약 화면의 학생 검색 결과
 */
export interface PublicStudent {
  /**
   * 학생 ID
   */
  studentId: string;

  /**
   * 학번
   */
  sourceStudentNo: string;

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
   * 대표 반 판정
   */
  representativeClass: RepresentativeClass;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 학생 현황 (tags: Admin students / Admin student sync)
 * openapi.yaml AdminStudentPage · StudentSyncStatus 를 그대로 다시 선언함
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 StudentSourceAssignment — 학생 1명이 원천에서 여러 반에 걸릴 수 있음
 * `teacherName` 은 여기에만 있음 — AdminStudent 최상위에는 담임 필드가 없으므로
 * 화면의 담임 열은 대표 배정(selectedSourceAssignmentKey)을 통해서만 말할 수 있음
 */
export interface StudentSourceAssignment {
  /**
   * 수강 등록 ID
   */
  assignmentId: string;

  /**
   * 원천 수강 등록 키
   */
  sourceAssignmentKey: string;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 반
   */
  className: string;

  /**
   * 학교
   */
  schoolName: string | null;

  /**
   * 학년
   */
  grade: string | null;

  /**
   * 담임
   */
  teacherName: string | null;

  /**
   * 원천 재원 상태
   */
  sourceStatus: string | null;

  /**
   * 원천 재원 여부
   */
  sourceActive: boolean;

  /**
   * 대표 반 후보 유형
   */
  candidateType: "REGULAR" | "SCIENCE" | "NONE";

  /**
   * 제외 사유
   */
  exclusionReason: "SUPPLEMENTARY" | "NONE";

  /**
   * 처음 확인한 동기화 실행 ID
   */
  firstSeenRunId: string;

  /**
   * 마지막으로 확인한 동기화 실행 ID
   */
  lastSeenRunId: string;
}

/**
 * 계약 AdminStudent (additionalProperties:false)
 *
 * 연락처는 `motherPhone`·`fatherPhone` 두 갈래이고 정규화된 전체 번호(8~15자리 숫자)임
 * 저장된 값이 없으면 null 임 — 둘 다 null 일 수 있음. 표기는 `fmtPhone` 을 거침
 */
export interface AdminStudent {
  /**
   * 학생 ID
   */
  studentId: string;

  /**
   * 학번
   */
  sourceStudentNo: string;

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
   * 어머니 연락처
   */
  motherPhone: string | null;

  /**
   * 아버지 연락처
   */
  fatherPhone: string | null;

  /**
   * 단위
   */
  unitName: string | null;

  /**
   * 원천 재원 여부
   */
  sourceActive: boolean;

  /**
   * 대표 반 판정
   */
  representativeClass: RepresentativeClass;
  /**
   * 수학 정규반 이름 — 배정이 없으면 null
   */
  mathClassName: string | null;
  /**
   * 과학반 이름 목록 — 없으면 빈 배열. 대표 반과 별개의 실제 배정 목록임
   */
  scienceClassNames: string[];
  /**
   * 선택 회차에 RESERVED·CHECKED_IN·NO_SHOW 예약이 있으면 true
   */
  hasReservation: boolean;
  /**
   * 선택 회차 예약 투영. 회차 미지정 또는 예약이 없으면 null
   */
  reservation: AdminStudentReservationProjection | null;

  /**
   * 수강 등록
   */
  assignments: StudentSourceAssignment[];

  /**
   * 처음 확인 시각
   */
  firstSeenAt: string;

  /**
   * 마지막 확인 시각
   */
  lastSeenAt: string;
}

/**
 * 계약 AdminStudentReservation — 선택 회차의 가족 예약 투영
 */
export interface AdminStudentReservationProjection {
  /**
   * 상태
   */
  status: FamilyBookingStatus;

  /**
   * 선택 회차 예약 여부
   */
  hasReservation: boolean;

  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 참석 보호자
   */
  attendanceParty: AttendanceParty;

  /**
   * 예약 경로
   */
  bookingSource: BookingSource;
}

/**
 * 계약 StudentClassificationSummary
 *
 * 범위(계약 그대로): 대부분의 값은 분원(branch) + 단위(unitGroup) + sourceActive:true
 *   범위에서만 센 분류 집계임 — 그래서 단위 탭을 바꾸면 이 수들도 함께 바뀜. 검색어(q)·
 *   담임(teacherName)·resolution·categorizedOnly·페이지 등 나머지 목록 필터는 의도적으로
 *   무시해 브라우징 중에도 헤더가 안정적임
 * 예외: `reviewRequiredStudentCount`(확인 필요) 하나만 분원(branch) 범위만이고 단위와
 *   그 밖의 모든 필터를 무시함 — 단위를 바꿔도 이 수는 그대로임
 * 반면 `AdminStudentPage.page.totalItems` 와 `items` 는 그 모든 필터가 걸린 결과임
 *   클라이언트는 요약을 다시 세거나 별도 요청을 더 쏘지 않고 서버 값을 그대로 그림
 *
 * 표시용 최종 4수는 아래 신규 필드임(재원생·수학 정규반·과학 정규반·확인 필요). 롤링
 * 배포로 아직 신규 필드가 없을 수 있어 선택 필드로 두고, 없을 때만 각각 대응하는 레거시
 * 필드로 떨어짐(`resolveStudentSummaryCounts` 가 그 폴백을 순수하게 판정함)
 */
export interface StudentClassificationSummary {
  /**
   * 고유 학생 수
   */
  uniqueStudentCount: number;

  /**
   * 수강 등록이 여러 개인 학생 수
   */
  multiAssignmentStudentCount: number;

  /**
   * 정규 반 하나로 판정된 학생 수
   */
  regularRepresentativeCount: number;

  /**
   * 과학 반만으로 판정된 학생 수
   */
  scienceAliasRepresentativeCount: number;

  /**
   * 정규 반 여러 개로 판정 불가한 학생 수
   */
  multipleRegularAmbiguousCount: number;

  /**
   * 반 없음으로 판정 불가한 학생 수
   */
  noClassAmbiguousCount: number;

  /**
   * 판정 불가 학생 수
   */
  ambiguousStudentCount: number;
  /**
   * 레거시 폴백 — 신규는 `mathStudentCount`. 수학 정규반에 배정된 학생 수
   */
  mathRegularStudentCount: number;
  /**
   * 레거시 폴백 — 신규는 `scienceOnlyStudentCount`. 과학 정규반에 배정된 학생 수
   */
  scienceRegularStudentCount: number;
  /**
   * 재원생 — 분류된 재원 합집합(무반 제외)의 UI 총원. branch+unitGroup 범위
   * 롤링 배포로 아직 없을 수 있음(폴백: `uniqueStudentCount`)
   */
  eligibleUniqueStudentCount?: number;
  /**
   * 수학 정규반 — 수학이 있는 전원(수학+과학 겸 학생 포함). branch+unitGroup 범위
   * 폴백: `mathRegularStudentCount`
   */
  mathStudentCount?: number;
  /**
   * 과학 정규반 — 수학이 없는 과학 학생. branch+unitGroup 범위
   * 폴백: `scienceRegularStudentCount`
   */
  scienceOnlyStudentCount?: number;
  /**
   * 확인 필요 — 분류 이상 전부. branch 범위만(unitGroup·그 밖의 모든 필터 무시)
   * 폴백: `ambiguousStudentCount`
   */
  reviewRequiredStudentCount?: number;
}

/**
 * 계약 AdminStudentPage. 관리자 학생 목록 한 페이지와 분류 집계
 */
export interface AdminStudentPage {
  /**
   * 목록
   */
  items: AdminStudent[];

  /**
   * 페이지 정보
   */
  page: PageMeta;

  /**
   * 요약
   */
  summary: StudentClassificationSummary;
  /**
   * 마지막으로 성공한 동기화 시각. 동기화 이력이 없으면 null
   */
  latestSuccessfulSyncAt: string | null;
  /**
   * 담임 선택지의 출처(계약 추가 필드). facets.teachers 는 teacherName 을 뺀 나머지 필터
   * (branch·unitGroup·query·sourceActive 등)에 걸리는 전체 결과의 서로 다른 대표 담임
   * 목록임 — 페이지네이션과 무관함. 서버가 NFKC 정규화 → 첫 콤마 담임 trim → 공백 제거
   * → 중복 제거 → 한글 정렬까지 마쳐 줌. 그래서 클라이언트가 페이지 items 로 다시 세지 않음
   */
  facets: AdminStudentFacets;
}

/**
 * 계약 AdminStudentPage.facets — 담임 필터 선택지의 출처
 */
export interface AdminStudentFacets {
  /**
   * 담임 선택지
   */
  teachers: string[];
}

/**
 * 계약 SyncCircuitStatus — 두 상태뿐임. HALF_OPEN 은 이 시스템에 없음
 */
export type SyncCircuitStatus = "CLOSED" | "OPEN";

/**
 * 계약 SyncCircuit. 학생 동기화 자동 실행 차단 회로
 */
export interface SyncCircuit {
  /**
   * 상태
   */
  status: SyncCircuitStatus;

  /**
   * 버전
   */
  version: number;

  /**
   * 회로가 열린 시각
   */
  openedAt: string | null;

  /**
   * 회로를 연 사유 코드
   */
  openedReasonCode: string | null;

  /**
   * 회로를 연 실행 ID
   */
  openedRunId: string | null;

  /**
   * 마지막 초기화 시각
   */
  lastResetAt: string | null;

  /**
   * 마지막 초기화 주체
   */
  lastResetBy: string | null;
}

/**
 * 계약 SyncRunStatus. 동기화 실행 전체 상태
 */
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

/**
 * 계약 BranchSyncStatus. 지점별 동기화 상태
 */
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

/**
 * 계약 SyncRunType. 정기·수동·초기 스냅샷 점검 실행
 */
export type SyncRunType = "SCHEDULED" | "MANUAL" | "INITIAL_SNAPSHOT_DRY_RUN";

/**
 * 실행이 아직 끝나지 않은 상태 — 이 동안에만 status 를 폴링함
 */
const ACTIVE_SYNC_RUN_STATUSES: ReadonlySet<SyncRunStatus> = new Set<SyncRunStatus>([
  "QUEUED",
  "RUNNING",
  "READY_TO_PUBLISH",
  "PUBLISHING",
]);

/**
 * 실행이 아직 진행 중인지 판별
 */
export function isActiveSyncRun(status: SyncRunStatus): boolean {
  return ACTIVE_SYNC_RUN_STATUSES.has(status);
}

/**
 * 분원 실행이 성공으로 끝난 상태 — 화면의 `완료` 표시는 이 집합으로만 판정함
 */
const SETTLED_BRANCH_SYNC_STATUSES: ReadonlySet<BranchSyncStatus> = new Set<BranchSyncStatus>([
  "PROMOTED",
  "NO_CHANGES",
]);

/**
 * 지점 동기화가 끝난 상태인지 판별
 */
export function isBranchSyncSettled(status: BranchSyncStatus): boolean {
  return SETTLED_BRANCH_SYNC_STATUSES.has(status);
}

/**
 * 실패로 보는 지점 동기화 상태
 */
const FAILED_BRANCH_SYNC_STATUSES: ReadonlySet<BranchSyncStatus> = new Set<BranchSyncStatus>([
  "FAILED",
  "CONFLICT",
  "CANCELLED",
]);

/**
 * 지점 동기화가 실패했는지 판별
 */
export function isBranchSyncFailed(status: BranchSyncStatus): boolean {
  return FAILED_BRANCH_SYNC_STATUSES.has(status);
}

/**
 * 지점 동기화 상태 표시 문구
 */
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

/**
 * 동기화 실행 상태 표시 문구
 */
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

/**
 * 계약 SyncCounts — 16개 전부 정수임
 */
export interface SyncCounts {
  /**
   * 조회 수강 등록 수
   */
  fetchedAssignmentCount: number;

  /**
   * 대괄호 반으로 제외한 수
   */
  bracketExcludedAssignmentCount: number;

  /**
   * 포함 수강 등록 수
   */
  includedAssignmentCount: number;

  /**
   * 고유 학생 수
   */
  uniqueStudentCount: number;

  /**
   * 수강 등록이 여러 개인 학생 수
   */
  multiAssignmentStudentCount: number;

  /**
   * 정규 반 하나로 판정된 학생 수
   */
  regularRepresentativeCount: number;

  /**
   * 과학 반만으로 판정된 학생 수
   */
  scienceAliasRepresentativeCount: number;

  /**
   * 정규 반 여러 개로 판정 불가한 학생 수
   */
  multipleRegularAmbiguousCount: number;

  /**
   * 반 없음으로 판정 불가한 학생 수
   */
  noClassAmbiguousCount: number;

  /**
   * 판정 불가 학생 수
   */
  ambiguousStudentCount: number;

  /**
   * 추가 학생 수
   */
  insertedStudentCount: number;

  /**
   * 변경 학생 수
   */
  updatedStudentCount: number;

  /**
   * 비활성화 학생 수
   */
  inactivatedStudentCount: number;

  /**
   * 추가 수강 등록 수
   */
  insertedAssignmentCount: number;

  /**
   * 변경 수강 등록 수
   */
  updatedAssignmentCount: number;

  /**
   * 비활성화 수강 등록 수
   */
  inactivatedAssignmentCount: number;
}

/**
 * 계약 BranchSyncRun — `sequence` 는 CAMPUS_A=1 / CAMPUS_B=2 / CAMPUS_C=3 순차 실행 순서임
 */
export interface BranchSyncRun {
  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 지점 처리 순번
   */
  sequence: 1 | 2 | 3;

  /**
   * 상태
   */
  status: BranchSyncStatus;

  /**
   * 건수
   */
  counts: SyncCounts;

  /**
   * 시작 시각
   */
  startedAt: string | null;

  /**
   * 종료 시각
   */
  finishedAt: string | null;

  /**
   * 오류 코드
   */
  errorCode: string | null;
}

/**
 * 계약 SyncRun. 동기화 실행 한 건과 지점별 결과
 */
export interface SyncRun {
  /**
   * 동기화 실행 ID
   */
  syncRunId: string;

  /**
   * 실행 유형
   */
  runType: SyncRunType;

  /**
   * 상태
   */
  status: SyncRunStatus;

  /**
   * 지점 처리 순서
   */
  branchOrder: [Branch, Branch, Branch];

  /**
   * 지점별 실행
   */
  branches: BranchSyncRun[];

  /**
   * 건수
   */
  counts: SyncCounts;

  /**
   * 시작 시각
   */
  startedAt: string;

  /**
   * 종료 시각
   */
  finishedAt: string | null;

  /**
   * 반영 시각
   */
  publishedAt: string | null;

  /**
   * 오류 코드
   */
  errorCode: string | null;

  /**
   * 요청 주체
   */
  requestedBy: string | null;

  /**
   * 사유
   */
  reason: string | null;
}

/**
 * 계약 CanonicalSnapshotBaseline. 초기 스냅샷 대조용 기준 건수
 */
export interface CanonicalSnapshotBaseline {
  /**
   * 기준 시점
   */
  capturedAt: string;

  /**
   * 고유 학생 수
   */
  uniqueStudentCount: number;

  /**
   * 포함 수강 등록 수
   */
  includedAssignmentCount: number;
}

/**
 * 계약 StudentSyncStatus (additionalProperties:false)
 *
 * 계약에 다음 동기화 예정 시각이 없음. 스케줄은 `scheduleIntervalHours`(6) +
 * `scheduleZone`(Asia/Seoul) 로만 표현되므로, 화면은 주기를 말할 수는 있어도
 * 구체적 다음 시각을 말할 수 없음 — 클라이언트가 계산해 지어내지 않음
 *
 * 분원별 상태도 최상위에 없음. `latestRun.branches[]` 안에만 있고,
 * `latestRun` 이 null 이면 분원 정보는 아예 없음
 */
export interface StudentSyncStatus {
  /**
   * 학생 원장 저장소
   */
  studentSourceOfTruth: "POSTGRESQL";

  /**
   * 정기 실행 시간대
   */
  scheduleZone: "Asia/Seoul";

  /**
   * 정기 실행 간격(시간)
   */
  scheduleIntervalHours: 6;

  /**
   * 지점 처리 순서
   */
  branchOrder: [Branch, Branch, Branch];

  /**
   * 로그인 회로 상태
   */
  circuit: SyncCircuit;
  /**
   * 이 배포의 실시간 원천(Tong) 어댑터가 실제로 붙어 실행을 시작할 수 있는가
   *
   * 회로(circuit)와 별개의 축임. 회로가 CLOSED 여도 어댑터 연동 자체가 꺼져 있으면
   *   이 값이 false 이고, 그때는 수동 실행을 시작할 수 없음 — 재시도가 아니라 운영자가 연동을
   *   켜야 풀림. 값은 서버가 판정하며 화면은 추정하지 않음
   */
  liveSourceReady: boolean;
  /**
   * 상태와 무관하게 가장 최근 실행임 — 진행 중 판정은 `isActiveSyncRun(latestRun.status)`
   */
  latestRun: SyncRun | null;

  /**
   * 기준 건수
   */
  canonicalReference: CanonicalSnapshotBaseline;
}

/**
 * 계약 ManualSyncRequest — reason 은 필수이고 3~500자임
 */
export interface ManualSyncRequest {
  /**
   * 사유
   */
  reason: string;
}

/**
 * 계약 PublicStudentPage. 공개 학생 검색 결과 한 페이지
 */
export interface PublicStudentPage {
  /**
   * 목록
   */
  items: PublicStudent[];

  /**
   * 페이지 정보
   */
  page: PageMeta;
}

/**
 * 계약 PublicSeminarSessionPage. 공개 회차 목록 한 페이지
 */
export interface PublicSeminarSessionPage {
  /**
   * 목록
   */
  items: PublicSeminarSession[];

  /**
   * 페이지 정보
   */
  page: PageMeta;
}

/**
 * 계약 FamilyBooking. 가족 예약
 */
export interface FamilyBooking {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 회차 ID
   */
  seminarSessionId: string;
  /**
   * 정규화된 전체 예약 연락처(8~15자리 숫자). ADMIN 응답과 OTP proof 로 본인이 소유를
   * 증명한 공개 생성·관리 응답에만 실림. 표기는 `fmtPhone` 을 거침
   */
  contact: string;

  /**
   * 참석 보호자
   */
  attendanceParty: AttendanceParty;

  /**
   * 예약 경로
   */
  bookingSource: BookingSource;
  /**
   * 서버 파생 — MOTHER=1 / FATHER=1 / BOTH=2. 자녀 수로 늘어나지 않음
   */
  seatCount: 1 | 2;
  /**
   * 실제 입장 인원 — 게이트에서 정함. 미입장이면 null. 예약 인원과 무관함
   */
  attendedCount: number | null;
  /**
   * QR 리허설용 예약. 통계에는 그대로 잡히고, 시트·일반 문자에서만 빠짐
   */
  isTest: boolean;

  /**
   * 상태
   */
  status: FamilyBookingStatus;

  /**
   * 참가 학생
   */
  students: FamilyBookingStudentSnapshot[];

  /**
   * QR 상태
   */
  qrStatus: QrCredentialStatus;

  /**
   * QR 버전
   */
  qrVersion: number;

  /**
   * 버전
   */
  version: number;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;

  /**
   * 입장 시각
   */
  checkedInAt: string | null;

  /**
   * 취소 시각
   */
  cancelledAt: string | null;
}

/**
 * 계약 OwnedFamilyBookingList. 증명한 연락처의 예약 목록
 */
export interface OwnedFamilyBookingList {
  /**
   * 목록
   */
  items: FamilyBooking[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * 공개 마스킹 가족 예약 (계약 PublicMaskedFamilyBooking / PublicMaskedFamilyBookingList)
 *
 * 공개 self-service 관리 경로(조회·상세·회차 이동·참석 변경·취소)가 다루는 유일한 읽기
 *   모델임. 전체 `FamilyBooking`(연락처 원문·학생 실명 포함)과 달리, 서버가 이미 이름과
 *   연락처를 마스킹해 내려줌: `participants[].maskedName`(`홍*동`)과 `maskedContact`
 *   (`010--1234`). 프론트는 이 값을 그대로 표시함 — 다시 마스킹하거나(이중 마스킹),
 *   복원·역마스킹·저장·로깅·URL 노출을 하지 않음
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 PublicMaskedFamilyBookingParticipant — 참가자 스냅샷의 마스킹된 최소 투영
 */
export interface PublicMaskedFamilyBookingParticipant {
  /**
   * 참여 유형. 재원생·비재원생
   */
  participantType: BookingParticipantType;
  /**
   * 서버가 마스킹한 이름(`홍*동`). 그대로 표시함 — 다시 마스킹하지 않음
   */
  maskedName: string;

  /**
   * 캠퍼스
   */
  branch: Branch;
}

/**
 * 계약 PublicMaskedFamilyBooking — 공개 관리 경로의 마스킹 가족 예약 집계
 * enum·좌석 파생 규칙은 전체 `FamilyBooking` 과 동일하되, 신원 필드만 마스킹돼 있고
 * 학생 식별자·학교·학번·담임 같은 민감 필드는 아예 오지 않음
 */
export interface PublicMaskedFamilyBooking {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 회차 ID
   */
  seminarSessionId: string;
  /**
   * 서버가 마스킹한 예약 연락처(`010-****-1234`). 그대로 표시함
   */
  maskedContact: string;

  /**
   * 참석 보호자
   */
  attendanceParty: AttendanceParty;

  /**
   * 예약 경로
   */
  bookingSource: BookingSource;
  /**
   * 서버 파생 — MOTHER=1 / FATHER=1 / BOTH=2. 자녀 수로 늘어나지 않음
   */
  seatCount: 1 | 2;

  /**
   * 상태
   */
  status: FamilyBookingStatus;

  /**
   * 참가자
   */
  participants: PublicMaskedFamilyBookingParticipant[];

  /**
   * QR 상태
   */
  qrStatus: QrCredentialStatus;

  /**
   * 버전
   */
  version: number;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;

  /**
   * 입장 시각
   */
  checkedInAt: string | null;

  /**
   * 취소 시각
   */
  cancelledAt: string | null;
}

/**
 * 계약 PublicMaskedFamilyBookingList — 연락처 조회(lookup) 결과. 매칭이 없으면 빈 배열
 */
export interface PublicMaskedFamilyBookingList {
  /**
   * 목록
   */
  items: PublicMaskedFamilyBooking[];
}

/**
 * 계약 PublicGuestParticipantInput.grade enum — 정확히 이 12개뿐임
 */
export type GuestGrade =
  | "초1" | "초2" | "초3" | "초4" | "초5" | "초6"
  | "중1" | "중2" | "중3"
  | "고1" | "고2" | "고3";

/**
 * 비재원생 학년 선택 목록
 */
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

/**
 * 계약 PublicGuestParticipantInput — name/branch/schoolName/grade 모두 필수임
 */
export interface PublicGuestParticipantInput {
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
  schoolName: string;

  /**
   * 학년
   */
  grade: GuestGrade;
}

/**
 * 계약 oneOf + discriminator(participantType):
 * ENROLLED 는 서버가 proof 연락처로 활성 자녀를 자동 연결함(본문에 studentIds 없음),
 * GUEST 는 guest 필수. 검증된 연락처는 proof 에서만 오고 본문에 다시 넣지 않음
 */
export type PublicFamilyBookingCreateRequest =
  | {
      /**
       * 참여 유형. 재원생·비재원생
       */
      participantType: "ENROLLED";

      /**
       * 회차 ID
       */
      seminarSessionId: string;

      /**
       * 참석 보호자
       */
      attendanceParty: AttendanceParty;
    }
  | {
      /**
       * 참여 유형. 재원생·비재원생
       */
      participantType: "GUEST";

      /**
       * 회차 ID
       */
      seminarSessionId: string;

      /**
       * 참석 보호자
       */
      attendanceParty: AttendanceParty;

      /**
       * 비재원생 정보
       */
      guest: PublicGuestParticipantInput;
    };

/**
 * 계약 minProperties: 2 — expectedVersion 외 최소 한 필드가 필요함
 * 공개 자기관리에서 자동 연결된 학생 구성은 불변임 — 계약에 studentIds 가 없음
 *   회차 이동·참석자 변경만 보냄(학생 변경은 관리자 경로 전용)
 */
export interface PublicFamilyBookingUpdateRequest {
  /**
   * 있으면 원자적 회차 이동 — 활성 가족 QR 은 유지됨
   */
  seminarSessionId?: string;

  /**
   * 참석 보호자
   */
  attendanceParty?: AttendanceParty;

  /**
   * 현재 버전. 다르면 409
   */
  expectedVersion: number;
}

/**
 * 계약 PublicCancellationRequest. 보호자 본인 취소 요청
 */
export interface PublicCancellationRequest {
  /**
   * 현재 버전. 다르면 409
   */
  expectedVersion: number;

  /**
   * 사유
   */
  reason?: string | null;
}

/**
 * 계약 PublicFamilyBookingReadSessionRequest (POST /public/family-bookings/{id}/read-session)
 * 연락처 조회로 이미 메모리에 있는 전체 연락처만 본문에 실음 — path·query·log 금지
 * 서버가 정규화해 정확히 그 예약 하나와 대조하고, 통과하면 30분 읽기 전용 관리 세션을 세움
 * 성공 응답은 `BookingAccessExchangeResult`(새 csrfToken 포함)로 개인 링크 교환과 같음
 */
export interface PublicFamilyBookingReadSessionRequest {
  /**
   * 보호자 연락처
   */
  contact: string;
}

/**
 * 계약 BookingAccessExchangeRequest (POST /public/booking-access/session)
 * accessToken 은 SMS 개인 링크의 URL fragment 로만 오고 이 본문에만 실림 — path·query·log 금지
 * contact 는 정규화 전 전체 전화번호(뒷자리만으로는 안 됨)
 */
export interface BookingAccessExchangeRequest {
  /**
   * 예약 관리 링크 토큰
   */
  accessToken: string;

  /**
   * 보호자 연락처
   */
  contact: string;
}

/**
 * 계약 BookingAccessExchangeResult — 30분 예약 범위 관리 세션(HttpOnly 쿠키)이 만들어짐
 * 세션 고정 방지로 브라우저 세션이 재생성되므로 새 `csrfToken` 을 즉시 채택해야 함
 */
export interface BookingAccessExchangeResult {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 만료 시각
   */
  expiresAt: string;

  /**
   * 새 CSRF 토큰
   */
  csrfToken: string;
}

/**
 * 계약 QrRecoveryResult (GET /public/family-bookings/{id}/qr)
 * AEAD 로 복호화·digest 검증된 현재 활성 QR 원문임 — 재발급이 아니라 조회임
 * 관리 세션 쿠키 또는 legacy BOOKING_MANAGE proof 중 하나로 인증함. 로깅 금지
 */
export interface QrRecoveryResult {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 버전
   */
  version: number;

  /**
   * 만료 시각
   */
  expiresAt: string;

  /**
   * QR 원문 토큰
   */
  qrToken: string;
}

/**
 * 신규 커밋만 최상위에 원문 qrToken 을 줌
 */
export interface FreshFamilyBookingMutation {
  /**
   * 예약
   */
  booking: FamilyBooking;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: false;

  /**
   * QR 원문 토큰
   */
  qrToken: string;

  /**
   * QR 만료 시각
   */
  qrExpiresAt: string;
}

/**
 * 리플레이 — 원문 QR 은 저장되지 않으므로 복구할 수 없음
 */
export interface ReplayedFamilyBookingMutation {
  /**
   * 예약
   */
  booking: FamilyBooking;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: true;
}

/**
 * 가족 예약 생성·변경 결과. 신규 처리 또는 재생
 */
export type FamilyBookingMutationResult = FreshFamilyBookingMutation | ReplayedFamilyBookingMutation;

/**
 * 새로 처리된 결과인지 판별
 */
export function isFreshBooking(result: FamilyBookingMutationResult): result is FreshFamilyBookingMutation {
  return result.replayed === false;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 설명회 · 회차 (tag: Admin seminars)
 * 회차만 평평하게 주는 목록 엔드포인트가 없음 — 설명회를 먼저 읽고 그 아래 회차를
 *   설명회별로 읽어야 함
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 SeminarStatus. 설명회 상태
 */
export type SeminarStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/**
 * 계약 Seminar. 설명회
 */
export interface Seminar {
  /**
   * 설명회 ID
   */
  seminarId: string;

  /**
   * 제목
   */
  title: string;

  /**
   * 설명
   */
  description: string | null;

  /**
   * 상태
   */
  status: SeminarStatus;

  /**
   * 버전
   */
  version: number;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;
}

/**
 * 계약 SeminarPage. 설명회 목록 한 페이지
 */
export interface SeminarPage {
  /**
   * 목록
   */
  items: Seminar[];

  /**
   * 페이지 정보
   */
  page: PageMeta;
}

/**
 * 계약 SeminarSessionStatus. 회차 상태
 */
export type SeminarSessionStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED" | "ARCHIVED";

/**
 * 계약 SessionOperationsSummary — 회차 목록 항목마다 서버가 함께 주는 가족 예약 건수 집계
 * (좌석 원장이 아님). 서버 원시 필드명은 `activeBookingCount…` 지만, 어댑터가 화면이 쓰는
 * 이 이름으로 정규화함
 *
 * active = RESERVED + CHECKED_IN (NO_SHOW 제외). unchecked = RESERVED 만
 * noShow 는 active·unchecked·cancelled 어디에도 섞이지 않음
 */
export interface SeminarSessionOperationsSummary {
  /**
   * 활성 예약 = RESERVED + CHECKED_IN (NO_SHOW 제외)
   */
  activeCount: number;
  /**
   * 입장 완료 = CHECKED_IN
   */
  checkedInCount: number;
  /**
   * 미체크 = RESERVED (아직 입장 안 함). NO_SHOW 제외
   */
  uncheckedCount: number;
  /**
   * 취소 = CANCELLED
   */
  cancelledCount: number;
  /**
   * 노쇼 = NO_SHOW. active·unchecked·cancelled 어디에도 안 들어감
   */
  noShowCount: number;
  /**
   * 실제로 입장한 사람 수 — 게이트가 확정한 인원의 합. 위 값들이 전부 예약 건수인 것과
   * 달리 이것만 명수임. 2명 예약에 한 분만 오면 입장 완료는 1건, 입장인원은 1명임
   */
  attendedPeopleCount: number;
}

/**
 * 계약 AdminSeminarSession — 공개용 PublicSeminarSession 과 다른 타입임
 * (이쪽은 `status`·`version` 이 있고 `availability`·`seminarTitle` 이 없음)
 * DB 컬럼은 place 지만 계약 필드명은 `location` 임
 */
export interface AdminSeminarSession {
  /**
   * 회차 ID
   */
  seminarSessionId: string;

  /**
   * 설명회 ID
   */
  seminarId: string;

  /**
   * 대상 범위. 전 지점·한 지점
   */
  scope: SeminarSessionScope;
  /**
   * scope 가 ALL 이면 정확히 null, BRANCH 면 정확히 구체 지점
   */
  branch: Branch | null;

  /**
   * 시작 시각
   */
  startsAt: string;

  /**
   * 종료 시각
   */
  endsAt: string;

  /**
   * 장소
   */
  location: string;

  /**
   * 예약 시작 시각
   */
  bookingOpensAt: string;

  /**
   * 예약 마감 시각
   */
  bookingClosesAt: string;

  /**
   * 상태
   */
  status: SeminarSessionStatus;
  /**
   * 계약 필수 필드 — 이 회차의 비재원생(guest) 예약 허용 여부. 관리자 토글이 PATCH 로 바꿈
   */
  guestBookingEnabled: boolean;
  /**
   * 회차 목록 엔드포인트가 항목마다 함께 주는 가족 예약 건수 집계. 콘솔은 오직 이 목록으로만
   * 회차를 읽고 어댑터가 항상 채워 주므로, 모든 카드가 좌석 원장(reservedCount) 근사 없이
   * 자기 실집계를 표시함
   */
  operationsSummary: SeminarSessionOperationsSummary;

  /**
   * 버전
   */
  version: number;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;
}

/**
 * 계약 AdminSeminarSessionPage. 관리자 회차 목록 한 페이지
 */
export interface AdminSeminarSessionPage {
  /**
   * 목록
   */
  items: AdminSeminarSession[];

  /**
   * 페이지 정보
   */
  page: PageMeta;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 가족 예약 (tag: Admin family bookings)
 * 읽기 모델은 공개 예약과 같은 `FamilyBooking` 집계를 그대로 돌려줌
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 FamilyBookingPage. 가족 예약 목록 한 페이지
 */
export interface FamilyBookingPage {
  /**
   * 목록
   */
  items: FamilyBooking[];

  /**
   * 페이지 정보
   */
  page: PageMeta;
}

/**
 * 계약 AdminFamilyBookingUpdateRequest — 관리자는 `reason` 이 필수임(공개 경로와 다름)
 * `attendanceParty` 전용 엔드포인트는 없음 — 이 일반 update 의 한 필드임
 */
export interface AdminFamilyBookingUpdateRequest {
  /**
   * 회차 ID
   */
  seminarSessionId?: string;

  /**
   * 참석 보호자
   */
  attendanceParty?: AttendanceParty;

  /**
   * 학생 ID 목록
   */
  studentIds?: string[];

  /**
   * 현재 버전. 다르면 409
   */
  expectedVersion: number;

  /**
   * 사유
   */
  reason: string;
}

/**
 * 계약 AdminCancellationType — 관리자 취소는 자유 사유가 아니라 정해진 갈래임
 * PHONE(전화취소)·TEACHER(선생님취소)·OTHER(기타취소) 세 가지뿐임
 */
export type AdminCancellationType = "PHONE" | "TEACHER" | "OTHER";

/**
 * 관리자 취소 유형 표시 문구
 */
const ADMIN_CANCELLATION_TYPE_LABELS: Record<AdminCancellationType, string> = {
  PHONE: "전화취소",
  TEACHER: "선생님취소",
  OTHER: "기타취소",
};

/**
 * 관리자 취소 유형 선택 목록
 */
export const ADMIN_CANCELLATION_TYPE_OPTIONS: ReadonlyArray<{ value: AdminCancellationType; label: string }> = [
  { value: "PHONE", label: ADMIN_CANCELLATION_TYPE_LABELS.PHONE },
  { value: "TEACHER", label: ADMIN_CANCELLATION_TYPE_LABELS.TEACHER },
  { value: "OTHER", label: ADMIN_CANCELLATION_TYPE_LABELS.OTHER },
];

/**
 * 계약 AdminCancellationRequest — 관리자 취소 본문은 정확히 `{expectedVersion, cancellationType}` 임
 * 자유 사유(reason)는 받지 않음(공개 취소만 선택적 reason 을 가짐)
 */
export interface AdminCancellationRequest {
  /**
   * 현재 버전. 다르면 409
   */
  expectedVersion: number;

  /**
   * 취소 유형
   */
  cancellationType: AdminCancellationType;
}

/**
 * 계약 AdminBookingSource — WEB_APP 은 공개 예약 전용이라 관리자가 쓸 수 없음
 */
export type AdminBookingSource = "PHONE" | "TEACHER" | "ON_SITE";

/**
 * 관리자 예약 경로 표시 문구
 */
export const ADMIN_BOOKING_SOURCE_LABELS: Record<AdminBookingSource, string> = {
  PHONE: "전화예약",
  TEACHER: "선생님 예약",
  ON_SITE: "현장 예약",
};

/**
 * 계약 AdminFamilyBookingCreateRequest (oneOf, discriminator: participantType)
 *
 * `contact` 는 두 갈래 모두 필수이고 write-only 임. ENROLLED 는 선택한 학생 전원의
 * 저장된 모/부 연락처와 digest 가 일치해야 하며, 어긋나면 403
 * STUDENT_CONTACT_OWNERSHIP_MISMATCH 임
 *
 * `reason` 은 선택임 — 생략하면 서버가 `bookingSource` 로 감사 사유를 파생함. 그래서
 *   화면은 자유 사유를 받지 않고, 없을 때 지어낸 값을 채워 넣는 대신 키 자체를 빼고 보냄
 */
export type AdminFamilyBookingCreateRequest =
  | {
      /**
       * 참여 유형. 재원생·비재원생
       */
      participantType: "ENROLLED";

      /**
       * 회차 ID
       */
      seminarSessionId: string;

      /**
       * 보호자 연락처
       */
      contact: string;

      /**
       * 참석 보호자
       */
      attendanceParty: AttendanceParty;

      /**
       * 예약 경로
       */
      bookingSource: AdminBookingSource;

      /**
       * 학생 ID 목록
       */
      studentIds: string[];

      /**
       * 사유
       */
      reason?: string;
    }
  | {
      /**
       * 참여 유형. 재원생·비재원생
       */
      participantType: "GUEST";

      /**
       * 회차 ID
       */
      seminarSessionId: string;

      /**
       * 보호자 연락처
       */
      contact: string;

      /**
       * 참석 보호자
       */
      attendanceParty: AttendanceParty;

      /**
       * 예약 경로
       */
      bookingSource: AdminBookingSource;

      /**
       * 비재원생 정보
       */
      guest: PublicGuestParticipantInput;

      /**
       * 사유
       */
      reason?: string;
    };

/* ── 회차 예약 명단 (계약 GET /admin/seminar-sessions/{id}/roster) ───────── */

/**
 * 계약 RosterUnitGroup — 상단 단위 탭이 서버로 보내는 값
 *
 * `단위`는 서버가 반의 접두사로 판정함. 화면은 탭 ↔ 이 enum 만 잇고,
 *   반명을 뜯어 단위를 다시 계산하지 않음 (SPECIAL_PURPOSE = 특목·예중1·예고1 처럼
 *   규칙이 서버에만 있음). GUEST 는 비재원생 행만 남기는 탭임
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

/**
 * 계약 SessionRosterRow.unitName — 서버가 판정한 정규 단위명. 규칙은 서버 몫임
 */
export type RosterUnitName = "초등" | "중등1" | "중등2" | "중등3" | "특목" | "예중1" | "예고1" | "고등" | "과학";

/**
 * 계약 SessionRosterBookingProjection — 그 행이 가리키는 가족 예약 집계의 투영
 *
 * 형제는 각자 행으로 오되 같은 `familyBookingId` 를 되풀이함 — 즉 이 값을 바꾸는
 *   조작은 언제나 가족 전체에 걸림. `seatCount` 도 참석 학부모로만 정해짐
 */
export interface SessionRosterBookingProjection {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 예약 학생 ID
   */
  familyBookingStudentId: string;

  /**
   * 상태
   */
  status: FamilyBookingStatus;

  /**
   * 참석 보호자
   */
  attendanceParty: AttendanceParty;

  /**
   * 예약 경로
   */
  bookingSource: BookingSource;
  /**
   * 예약 인원. 계약 enum [1, 2].
   */
  seatCount: number;
  /**
   * 실제로 입장한 인원 — 게이트에서 정함. 미입장이면 null
   * 예약 인원(seatCount)보다 작을 수도 클 수도 있음: 사실을 그대로 적음
   */
  attendedCount: number | null;
  /**
   * QR 리허설용 예약. 통계에는 그대로 잡히고, 시트·일반 문자에서만 빠짐. 명단 맨 앞 고정
   */
  isTest: boolean;

  /**
   * 입장 시각
   */
  checkedInAt: string | null;

  /**
   * 취소 시각
   */
  cancelledAt: string | null;
  /**
   * 낙관적 잠금 값 — 조작에 그대로 실어 보냄
   */
  version: number;
}

/**
 * 계약 RosterOperationalEventType — QR 수명주기 이벤트는 서버가 이미 걸러냄
 */
export type RosterOperationalEventType = "CREATED" | "UPDATED" | "CANCELLED" | "CHECKED_IN" | "MARKED_NO_SHOW";

/**
 * 계약 SessionRosterOperationalEvent.label 의 enum — 서버가 주는 값은 정확히 이 여섯 개임
 *
 * `string` 으로 두면 화면이 임의 문구를 label 자리에 넣어도 타입이 통과함. 좁혀 두면
 * 계약에 없는 문구를 만드는 순간 컴파일이 막음. 런타임 값은 바꾸지 않음 — 이건 순수 타입임
 */
export type RosterOperationalEventLabel =
  | "웹앱 예약"
  | "수동 예약"
  | "웹앱 예약 취소"
  | "수동 예약 취소"
  | "입장 완료"
  | "미참석 처리";

/**
 * 계약 SessionRosterOperationalEvent — 최신 로그 한 줄
 *
 * `label` 은 서버가 정한 문구임 (웹앱 예약 / 수동 예약 / 웹앱 예약 취소 /
 *   수동 예약 취소 / 입장 완료 / 미참석 처리). 화면이 type+actor 로 다시 지어내지 않음 —
 *   같은 CREATED 라도 주체에 따라 문구가 갈리는 규칙이 서버에 있음
 */
export interface SessionRosterOperationalEvent {
  /**
   * 이벤트 ID
   */
  eventId: string;

  /**
   * 종류
   */
  type: RosterOperationalEventType;

  /**
   * 처리 주체 유형
   */
  actorType: AuditActorType;

  /**
   * 표시 문구
   */
  label: RosterOperationalEventLabel;

  /**
   * 발생 시각
   */
  occurredAt: string;
}

/**
 * 계약 SessionRosterBookingHistoryReference — 이 행의 이력이 걸쳐 있는 가족 예약들
 *
 * 취소 뒤 재예약이면 항목이 여럿임(집계가 새로 생기므로). 목록을 그릴 때 미리 읽지
 * 않음 — `eventsPath` 는 열었을 때 부를 곳을 서버가 알려 주는 포인터일 뿐임
 */
export interface SessionRosterBookingHistoryReference {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 상태
   */
  status: FamilyBookingStatus;
  /**
   * 지금 그 행이 대표로 보여 주는 집계인지
   */
  current: boolean;

  /**
   * 이벤트 조회 API 경로
   */
  eventsPath: string;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 취소 시각
   */
  cancelledAt: string | null;
}

/**
 * 계약 SessionRosterRow — 그 회차의 예약과 연결된 재원·비재원 참가자
 *
 * 서버가 페이지네이션 전에 booked-only 범위를 적용하므로 예약 없는 재원생은 오지
 *   않음. `booking` nullable 표현은 방어적 호환을 위해 유지함. 재원생은 모/부 전체 연락처,
 *   비재원생은 `guestContact` 만 옴(반대쪽은 언제나 null). 전부 ADMIN 전용 민감 필드임 —
 *   저장·로깅 금지
 */
export interface SessionRosterRow {
  /**
   * 명단 행 ID
   */
  rosterEntryId: string;

  /**
   * 참여 유형. 재원생·비재원생
   */
  participantType: BookingParticipantType;

  /**
   * 학생 ID
   */
  studentId: string | null;

  /**
   * 예약 학생 ID
   */
  familyBookingStudentId: string | null;

  /**
   * 학번
   */
  sourceStudentNo: string;

  /**
   * 이름
   */
  name: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 대표 반 이름
   */
  representativeClassName: string;
  /**
   * 수학 정규반 이름 — 배정이 없으면 null. AdminStudent 와 같은 필드임(서버가 회차 행에도 실어 줌)
   */
  mathClassName: string | null;
  /**
   * 과학반 이름 목록 — 없으면 빈 배열. 대표 반과 별개의 실제 배정 목록이라 여러 개일 수 있음
   */
  scienceClassNames: string[];

  /**
   * 학교
   */
  schoolName: string | null;

  /**
   * 학년
   */
  grade: string | null;

  /**
   * 단위
   */
  unitName: RosterUnitName | null;

  /**
   * 대표 담임
   */
  primaryTeacher: string | null;
  /**
   * ADMIN 전용 전체 번호 (ENROLLED). GUEST 는 null
   */
  motherPhone: string | null;
  /**
   * ADMIN 전용 전체 번호 (ENROLLED). GUEST 는 null
   */
  fatherPhone: string | null;
  /**
   * ADMIN 전용 전체 번호 (GUEST). ENROLLED 는 null
   */
  guestContact: string | null;

  /**
   * 예약
   */
  booking: SessionRosterBookingProjection | null;

  /**
   * 가장 최근 운영 이벤트
   */
  latestOperationalEvent: SessionRosterOperationalEvent | null;

  /**
   * 예약 이력
   */
  bookingHistory: SessionRosterBookingHistoryReference[];
}

/**
 * 계약 SessionRosterFacets — 담임 선택지의 출처
 * 회차 범위와 분원에만 좌우되고 단위·검색 필터에는 흔들리지 않음(서버 주석 그대로)
 */
export interface SessionRosterFacets {
  /**
   * 이미 정규화된 대표 담임(원본 콤마 목록의 첫 이름)임 — 다시 자르지 않음
   */
  teachers: string[];

  /**
   * 어느 단위 탭에도 속하지 않는 재원생 수
   */
  unmatchedUnitCount: number;
}

/**
 * 현재 예약 명단 필터 범위의 참석 규모. 형제자매는 학생 행에는 각각 나타나지만 가족 예약은
 * 한 번만 세고, 실제 참가자는 참석 학부모(모·부 1명, 모/부 2명) 수로 셈
 */
export interface ParticipationMonitoring {
  /**
   * 학생 수
   */
  studentCount: number;

  /**
   * 가족 예약 수
   */
  familyBookingCount: number;

  /**
   * 예상 참석 인원
   */
  attendeeCount: number;
}

/**
 * 계약 SessionRosterPage. 회차 명단 한 페이지와 필터 선택지·모니터링 수치
 */
export interface SessionRosterPage {
  /**
   * 목록
   */
  items: SessionRosterRow[];

  /**
   * 페이지 정보
   */
  page: PageMeta;

  /**
   * 필터 선택지
   */
  facets: SessionRosterFacets;

  /**
   * 명단 모니터링 수치
   */
  monitoring: ParticipationMonitoring;
}

/**
 * 계약 BookingAuditEventType. 예약 이력 이벤트 종류
 */
export type BookingAuditEventType =
  | "CREATED"
  | "UPDATED"
  | "CANCELLED"
  | "QR_ISSUED"
  | "QR_ROTATED"
  | "QR_REVOKED"
  | "CHECKED_IN"
  | "MARKED_NO_SHOW";

/**
 * 예약 이력 이벤트 표시 문구
 */
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

/**
 * 계약 AuditActorType. 이력 처리 주체 유형
 */
export type AuditActorType = "ADMIN" | "SCANNER" | "PUBLIC_PROOF" | "SYSTEM";

/**
 * 이력 처리 주체 표시 문구
 */
export const AUDIT_ACTOR_TYPE_LABELS: Record<AuditActorType, string> = {
  ADMIN: "관리자",
  SCANNER: "스캐너",
  PUBLIC_PROOF: "학부모 본인 인증",
  SYSTEM: "시스템",
};

/**
 * 계약 AuditActor — `type` 만 언제나 있고 신원 두 필드는 nullable 임
 * SYSTEM 이 일으킨 이벤트에는 사람이 없으므로 이름을 지어내지 않음
 */
export interface AuditActor {
  /**
   * 종류
   */
  type: AuditActorType;

  /**
   * 주체 ID
   */
  subjectId: string | null;

  /**
   * 표시 이름
   */
  displayName: string | null;
}

/**
 * 계약 SafeAuditMetadata — 허용 목록 기반 스칼라 맵임
 * QR·OTP·페어링·proof 원문, 전체 연락처, 비밀번호는 계약상 여기 들어오지 않음
 */
export type SafeAuditMetadata = Record<string, string | number | boolean | null>;

/**
 * 계약 BookingCancellationType — 취소 이벤트가 어떤 갈래로 일어났는지
 *
 * 관리자 취소 세 갈래(PHONE·TEACHER·OTHER)에 학부모 본인 취소(SELF_SERVICE)가 더해진
 * 감사용 전체 집합임. 요청 본문 enum(AdminCancellationType)은 관리자만 고르므로 SELF_SERVICE 를
 * 넣지 않음 — 그쪽은 그대로 두고, 여기만 본인 취소를 포함한 상위 집합으로 둠
 */
export type BookingCancellationType = "SELF_SERVICE" | AdminCancellationType;

/**
 * 예약 취소 유형 표시 문구
 */
export const BOOKING_CANCELLATION_TYPE_LABELS: Record<BookingCancellationType, string> = {
  SELF_SERVICE: "본인취소",
  PHONE: ADMIN_CANCELLATION_TYPE_LABELS.PHONE,
  TEACHER: ADMIN_CANCELLATION_TYPE_LABELS.TEACHER,
  OTHER: ADMIN_CANCELLATION_TYPE_LABELS.OTHER,
};

/**
 * 계약 BookingAuditEvent (additionalProperties:false) — append-only 임
 * 사유는 `reason` 최상위 필드임 (metadata 안이 아님)
 *
 * `cancellationType` 은 취소 갈래를 담은 필수·nullable 필드임 — CANCELLED 가 아닌 이벤트는
 * null 임. 화면은 이 타입 필드로만 취소 갈래를 말하고, reason·metadata 로 추정하지 않음
 */
export interface BookingAuditEvent {
  /**
   * 이벤트 ID
   */
  eventId: string;
  /**
   * 계약 AuditSequence — bigint 정밀도를 지키려고 문자열로 옴. 숫자로 바꾸지 않음
   */
  sequence: string;

  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 종류
   */
  type: BookingAuditEventType;

  /**
   * 처리 주체
   */
  actor: AuditActor;

  /**
   * 사유
   */
  reason: string | null;

  /**
   * 취소 유형
   */
  cancellationType: BookingCancellationType | null;

  /**
   * 부가 정보
   */
  metadata: SafeAuditMetadata;

  /**
   * 발생 시각
   */
  occurredAt: string;
}

/**
 * 계약 EventPageMeta — 커서 페이지네이션임(page/pageSize 아님)
 */
export interface EventPageMeta {
  /**
   * 다음 조회 커서. 더 없으면 null
   */
  nextAfterSequence: string | null;

  /**
   * 다음 데이터 존재 여부
   */
  hasMore: boolean;
}

/**
 * 계약 BookingAuditEventPage. 예약 이력 한 페이지
 */
export interface BookingAuditEventPage {
  /**
   * 목록
   */
  items: BookingAuditEvent[];

  /**
   * 페이지 정보
   */
  page: EventPageMeta;
}

/**
 * 감사 주체를 한 줄로 — 이름이 없으면 역할만 말함
 */
export function auditActorLabel(actor: AuditActor): string {
  const role = AUDIT_ACTOR_TYPE_LABELS[actor.type];
  return actor.displayName === null ? role : `${role} · ${actor.displayName}`;
}

/**
 * 계약 QrCredentialMetadata. QR 자격 증명 정보. 원문 토큰 없음
 */
export interface QrCredentialMetadata {
  /**
   * QR 자격 증명 ID
   */
  credentialId: string;

  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 버전
   */
  version: number;

  /**
   * 상태
   */
  status: QrCredentialStatus;

  /**
   * 발급 시각
   */
  issuedAt: string;

  /**
   * 만료 시각
   */
  expiresAt: string;

  /**
   * 해제 시각
   */
  revokedAt: string | null;
}

/**
 * 계약 QrRotationRequest. 관리자 QR 재발급 요청
 */
export interface QrRotationRequest {
  /**
   * 사유
   */
  reason: string;
}

/**
 * 새로 처리된 QR 재발급 결과
 */
export interface FreshQrRotation {
  /**
   * QR 자격 증명 정보
   */
  credential: QrCredentialMetadata;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: false;

  /**
   * QR 원문 토큰
   */
  qrToken: string;
}

/**
 * 멱등 키 재요청으로 재생한 QR 재발급 결과
 */
export interface ReplayedQrRotation {
  /**
   * QR 자격 증명 정보
   */
  credential: QrCredentialMetadata;

  /**
   * 같은 멱등 키 재요청으로 재생한 응답 여부
   */
  replayed: true;
}

/**
 * QR 재발급 결과. 신규 처리 또는 재생
 */
export type QrRotationResult = FreshQrRotation | ReplayedQrRotation;



/* ────────────────────────────────────────────────────────────────────────────
 * 관리자 문자 (tag: Admin SMS)
 *
 * 계약이 확정됐음 — 아래 타입은 openapi.yaml 의 SMS 스키마를 그대로 옮긴 것임
 * 서버가 변수 치환·바이트 분류·배치 집계를 모두 하므로, 화면은 여기 오는 값을 세지 않고
 * 그대로 읽음. 연락처는 어떤 필드로도 평문이 오지 않음 (`*-**-1234` 뿐)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 SmsPurpose. 문자 용도
 */
export type SmsPurpose =
  | "OTP"
  | "BOOKING_CONFIRMED"
  | "BOOKING_UPDATED"
  | "BOOKING_CANCELLED"
  | "FIRST_CHECK_IN"
  | "ADMIN_GROUP";

/**
 * 관리자 화면에서 편집 가능한 문자 용도. 자동 입장 문자는 서버 전용으로 유지함
 */
export type SmsEditablePurpose = Exclude<SmsPurpose, "FIRST_CHECK_IN">;

/**
 * 서버가 제공하는 용도별 편집 정책. 변수와 신규 키 접두어의 기준임
 */
export interface SmsTemplatePurposePolicy {
  /**
   * 용도
   */
  purpose: SmsEditablePurpose;

  /**
   * 표시 문구
   */
  label: string;

  /**
   * 허용 변수
   */
  variables: string[];

  /**
   * 새 템플릿 키 접두어
   */
  keyPrefix: string;
}

/**
 * 관리자 문자 화면의 편집 정책 응답. 배열 순서가 화면의 용도 선택 순서임
 */
export interface SmsTemplatePolicy {
  /**
   * 기본 선택 용도
   */
  defaultPurpose: SmsEditablePurpose;

  /**
   * 편집 가능 용도 목록
   */
  purposes: SmsTemplatePurposePolicy[];
}

/**
 * 계약 SmsMessageType. 90바이트 이하는 SMS, 초과는 LMS
 */
export type SmsMessageType = "SMS" | "LMS";

/**
 * 계약 SmsDeliveryStatus. CLAIMED·SENDING 은 워커가 집어 든 중간 상태임
 */
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

/**
 * 단체 문자 수신 대상 4종. 서버가 모두 지원함
 */
export type SmsAudience =
  | "BOOKED_FAMILIES"
  | "RESERVED_FAMILIES"
  | "CHECKED_IN_FAMILIES"
  | "CANCELLED_FAMILIES"
  /**
   * 테스트 예약만. 다른 모든 대상에서는 테스트 예약이 제외됨
   */
  | "TEST_ACCOUNTS";

/**
 * 수신 대상 그룹 이름. 확인 대화상자가 이 문구를 그대로 보여 줌
 */
export const SMS_AUDIENCE_LABELS: Record<SmsAudience, string> = {
  BOOKED_FAMILIES: "예약자 전체",
  RESERVED_FAMILIES: "미체크만",
  CHECKED_IN_FAMILIES: "입장 완료",
  CANCELLED_FAMILIES: "취소자",
  TEST_ACCOUNTS: "테스트 계정",
};

/**
 * 단체 문자 발송 대상 선택 목록
 */
export const SMS_AUDIENCE_OPTIONS: ReadonlyArray<{ value: SmsAudience; label: string }> = [
  { value: "BOOKED_FAMILIES", label: SMS_AUDIENCE_LABELS.BOOKED_FAMILIES },
  { value: "RESERVED_FAMILIES", label: SMS_AUDIENCE_LABELS.RESERVED_FAMILIES },
  { value: "CHECKED_IN_FAMILIES", label: SMS_AUDIENCE_LABELS.CHECKED_IN_FAMILIES },
  { value: "CANCELLED_FAMILIES", label: SMS_AUDIENCE_LABELS.CANCELLED_FAMILIES },
  // 맨 오른쪽 — 실제 가족에게 닿지 않고 발송 경로만 확인하는 대상임
  { value: "TEST_ACCOUNTS", label: SMS_AUDIENCE_LABELS.TEST_ACCOUNTS },
];

/**
 * 계약 SmsGatewayReadiness — 시크릿이 아닌 플래그만 옴
 *
 * `adapterAvailable` 은 HTTP API 프로세스에서 항상 false 임 (provider 어댑터가 워커에
 * 격리돼 있음). `workerOnly` 는 계약상 const true. 따라서 이 둘도, `configured` 도 발송
 * 가능 여부가 아님 — 기능이 꺼진 `enabled:false` 만 발송 불가임
 */
export interface SmsGatewayReadiness {
  /**
   * 사용 여부
   */
  enabled: boolean;

  /**
   * 설정 완료 여부
   */
  configured: boolean;

  /**
   * 수신 허용 목록 적용 여부
   */
  allowlistEnabled: boolean;

  /**
   * 알리고 테스트 모드 여부
   */
  testMode: boolean;

  /**
   * 발송 어댑터 사용 가능 여부
   */
  adapterAvailable: boolean;

  /**
   * 실제 발송은 워커 전용인지 여부
   */
  workerOnly: boolean;
}

/**
 * 계약 SmsPayloadClassification — 서버가 NFC 정규화 + EUC-KR 로 센 값이 유일한 진실임
 */
export interface SmsPayloadClassification {
  /**
   * SMS·LMS
   */
  messageType: SmsMessageType;

  /**
   * 본문 EUC-KR 바이트
   */
  messageBytes: number;

  /**
   * 제목 EUC-KR 바이트
   */
  titleBytes: number | null;
}

/**
 * 계약 SmsTemplate. `version` 은 낙관적 잠금용 10진 문자열임 — 숫자로 바꾸지 않음
 */
export interface SmsTemplate {
  /**
   * 템플릿 ID
   */
  templateId: string;

  /**
   * 키
   */
  key: string;

  /**
   * 이름
   */
  name: string;

  /**
   * 용도
   */
  purpose: SmsPurpose;

  /**
   * 제목
   */
  title: string | null;

  /**
   * 본문
   */
  body: string;

  /**
   * 활성 여부
   */
  active: boolean;
  /**
   * 용도(purpose)별로 활성 기본 템플릿이 정확히 하나 유지됨
   */
  isDefault: boolean;

  /**
   * 버전
   */
  version: string;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;
}

/**
 * 계약 SmsTemplateList. 문자 템플릿 목록
 */
export interface SmsTemplateList {
  /**
   * 목록
   */
  items: SmsTemplate[];
}

/**
 * 계약 SmsTemplateCreated — 생성 응답만 classification 을 함께 줌
 */
export interface SmsTemplateCreated extends SmsTemplate {
  /**
   * 문자 유형·바이트 분류
   */
  classification: SmsPayloadClassification;
}

/**
 * 계약 SmsTemplateRemovalDisposition — DELETE 결과가 하드 삭제였는지 보관이었는지
 * `DELETED` 는 사용 이력이 없어 행이 사라졌다는 뜻, `ARCHIVED` 는 이력이 있어 inactive 로 남겼다는 뜻
 */
export type SmsTemplateRemovalDisposition = "DELETED" | "ARCHIVED";

/**
 * 계약 SmsTemplateRemovalResult — DELETE /admin/sms/templates/{templateId} 응답
 *
 * `archivedTemplate` 는 `disposition:"ARCHIVED"` 일 때만 채워지고(그때 inactive 행), 하드 삭제면 null 임
 * `usageCount` 는 이 템플릿을 참조하는 durable outbox 스냅샷 수임 — 0 이면 삭제, 그 외엔 보관됨
 */
export interface SmsTemplateRemovalResult {
  /**
   * 템플릿 ID
   */
  templateId: string;

  /**
   * 처리 방식
   */
  disposition: SmsTemplateRemovalDisposition;

  /**
   * 발송 이력 사용 횟수
   */
  usageCount: number;

  /**
   * 보관된 템플릿. 삭제했으면 null
   */
  archivedTemplate: SmsTemplate | null;
}

/**
 * 계약 SmsRenderedSample — 수신자 한 명에게 실제로 나갈 본문임
 * 변수는 서버가 이미 치환했고 바이트/타입도 그 결과를 잰 값임
 */
export interface SmsRenderedSample {
  /**
   * 가족 예약 ID
   */
  familyBookingId: string;

  /**
   * 마스킹한 수신 번호
   */
  maskedRecipient: string;

  /**
   * 본문
   */
  message: string;

  /**
   * 제목
   */
  title: string | null;

  /**
   * SMS·LMS
   */
  messageType: SmsMessageType;

  /**
   * 본문 EUC-KR 바이트
   */
  messageBytes: number;

  /**
   * 제목 EUC-KR 바이트
   */
  titleBytes: number | null;
}

/**
 * 계약 SmsTargetPreview
 *
 * `messageTemplate` 은 치환 전 원문이고, 실제로 나갈 문장은 `samples` 에 있음
 * `maximum*` 은 수신자 전체에서의 최댓값이며 수신자가 0 명이면 전부 null 임 —
 * 그때 0 이나 "SMS" 로 채우지 않음
 */
export interface SmsTargetPreview {
  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 회차 ID
   */
  seminarSessionId: string;

  /**
   * 발송 대상
   */
  audience: SmsAudience;
  /**
   * 서버가 센 권위 있는 대상 수 — 화면이 다시 세지 않음
   */
  recipientCount: number;
  /**
   * 발송 때 그대로 되돌려 보내야 하는 토큰
   */
  previewToken: string;
  /**
   * 최대 10건, 전부 마스킹돼서 옴
   */
  maskedRecipients: string[];
  /**
   * 직접 입력이면 null
   */
  templateId: string | null;
  /**
   * 직접 입력이면 서버가 "직접 입력" 을 넣어 줌 — 항상 값이 있음
   */
  templateName: string;

  /**
   * 치환 전 본문
   */
  messageTemplate: string;

  /**
   * 치환 전 제목
   */
  titleTemplate: string | null;
  /**
   * 최대 10건. 수신자가 0 명이면 빈 배열임
   */
  samples: SmsRenderedSample[];

  /**
   * 가장 긴 문자 유형
   */
  maximumMessageType: SmsMessageType | null;

  /**
   * 최대 본문 바이트
   */
  maximumMessageBytes: number | null;

  /**
   * 최대 제목 바이트
   */
  maximumTitleBytes: number | null;
}

/**
 * 계약 SmsEnqueueAccepted (202)
 */
export interface SmsEnqueueAccepted {
  /**
   * 발송 배치 ID
   */
  batchId: string;

  /**
   * 적재 건수
   */
  queuedCount: number;

  /**
   * 미리보기 결과 토큰
   */
  previewToken: string;

  /**
   * 상태
   */
  status: "QUEUED";

  /**
   * 출처
   */
  source: "ADMIN_GROUP";

  /**
   * 템플릿 ID
   */
  templateId: string | null;

  /**
   * 템플릿 이름
   */
  templateName: string;
}

/**
 * 계약 SmsMessageSummary — 수신자별 1행. 본문·전체 연락처는 계약이 의도적으로 뺐음
 */
export interface SmsMessageSummary {
  /**
   * 문자 ID
   */
  messageId: string;
  /**
   * 배치에 속하지 않는 자동 발송(OTP 등)이면 null
   */
  batchId: string | null;

  /**
   * 출처
   */
  source: SmsPurpose;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 회차 ID
   */
  seminarSessionId: string | null;

  /**
   * 가족 예약 ID
   */
  familyBookingId: string | null;

  /**
   * 템플릿 ID
   */
  templateId: string | null;

  /**
   * 템플릿 이름
   */
  templateName: string | null;

  /**
   * 발송 대상
   */
  audience: SmsAudience | null;
  /**
   * 항상 `*-**-1234` 형태 — 원본 번호는 서버를 떠나지 않음
   */
  maskedRecipient: string;

  /**
   * SMS·LMS
   */
  messageType: SmsMessageType;

  /**
   * 본문 EUC-KR 바이트
   */
  messageBytes: number;

  /**
   * 상태
   */
  status: SmsDeliveryStatus;

  /**
   * 시도 횟수
   */
  attemptCount: number;

  /**
   * 공급자 메시지 ID
   */
  providerMessageId: string | null;

  /**
   * 공급자 결과 코드
   */
  providerResultCode: number | null;

  /**
   * 마지막 오류 코드
   */
  lastErrorCode: string | null;

  /**
   * 처리 주체
   */
  actorSubject: string | null;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;
}

/**
 * 계약 SmsBatchStatus. 발송 배치 상태
 */
export type SmsBatchStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "PARTIAL" | "FAILED";

/**
 * 계약 SmsBatchSummary — 배치 집계의 유일한 진실임
 *
 * 서버가 SQL 로 센 값이라 화면이 items 를 다시 묶어 세면 안 됨 (같은 건을 두 번 셈)
 * `pendingCount` 는 PENDING·CLAIMED·SENDING, `failureCount` 는 차단·영구실패·미상·DEAD 를 포함함
 */
export interface SmsBatchSummary {
  /**
   * 발송 배치 ID
   */
  batchId: string;

  /**
   * 출처
   */
  source: "ADMIN_GROUP";

  /**
   * 템플릿 ID
   */
  templateId: string | null;

  /**
   * 템플릿 이름
   */
  templateName: string;

  /**
   * 발송 대상
   */
  audience: SmsAudience;

  /**
   * 회차 ID
   */
  seminarSessionId: string;

  /**
   * 캠퍼스
   */
  branch: Branch;

  /**
   * 수신자 수
   */
  recipientCount: number;

  /**
   * 성공 건수
   */
  successCount: number;

  /**
   * 실패 건수
   */
  failureCount: number;

  /**
   * 대기·처리 중 건수
   */
  pendingCount: number;

  /**
   * 상태
   */
  status: SmsBatchStatus;

  /**
   * 처리 주체
   */
  actorSubject: string | null;

  /**
   * 생성 시각
   */
  createdAt: string;

  /**
   * 변경 시각
   */
  updatedAt: string;
}

/**
 * 계약 SmsMessageList — 배치 집계와 수신자별 행을 함께 줌
 */
export interface SmsMessageList {
  /**
   * 발송 배치
   */
  batches: SmsBatchSummary[];

  /**
   * 목록
   */
  items: SmsMessageSummary[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * 공개 포스터 (계약 tags: Public poster / Admin poster)
 * GET /public/poster (same-origin, 항상 200) · PUT /admin/poster (multipart)
 * 서버가 이미지 내용의 sha256 을 버전으로 삼아 불변 URL 로 서빙함 — 폭·높이 메타데이터는 없음
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 계약 poster mediaType — 정확히 이 셋만 허용함(그 밖은 계약상 오지 않음)
 */
export type PosterMediaType = "image/png" | "image/jpeg" | "image/webp";

/**
 * 계약 PosterDescriptor — 현재 게시된 포스터의 서술자
 *
 * - `version` 은 이미지 내용의 sha256(64 소문자 hex)임
 * - `imageUrl` 은 그 버전을 가리키는 불변 same-origin 경로
 *   `/api/v1/public/poster/image/<64 hex>` 임. 버전이 곧 URL 이라 캐시 무효화가 필요 없음
 * - 폭·높이 메타데이터가 없으므로 화면은 자연 비율의 반응형 네이티브 이미지로 그림
 */
export interface PosterDescriptor {
  /**
   * 버전
   */
  version: string;

  /**
   * 이미지 경로
   */
  imageUrl: string;

  /**
   * 미디어 타입
   */
  mediaType: PosterMediaType;

  /**
   * 크기(바이트)
   */
  sizeBytes: number;

  /**
   * 변경 시각
   */
  updatedAt: string;
}

/**
 * 계약 PosterResource — GET /public/poster 와 PUT /admin/poster 성공 응답의 봉투
 * 게시된 포스터가 없으면 `poster: null`(공개 GET 은 이 경우에도 200)이고, 있으면 서술자임
 */
export interface PosterResource {
  /**
   * 포스터 정보
   */
  poster: PosterDescriptor | null;
}
