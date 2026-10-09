/**
 * 브라우저 전용 Nest API 어댑터 공개 API
 * 계약(packages/contracts/openapi.yaml)만 보고 만듦 — `apps/api` 를 import 하지 않음
 */

export { apiRequest, bootstrapCsrf, resetCsrfToken } from "./client";
export type { ApiMethod, ApiRequestOptions } from "./client";

export { ApiError, defaultErrorMessage, isAborted, isApiError } from "./problem";
export type { Problem, ProblemFieldError } from "./problem";

// 키 생성 함수는 내보내지 않음 — 수명을 관리하는 훅을 통해서만 키를 얻음
export {
  isDefinitiveFailure,
  sameOperationIntent,
  useKeyedOperationIntents,
  useKeyedOperationKeys,
  useOperationKey,
} from "./idempotency";
export type {
  KeyedOperationIntents,
  KeyedOperationKeys,
  OperationIntentLookup,
  OperationKeyHandle,
  OperationKeyLookup,
} from "./idempotency";

export * from "./contract";

export { ADMIN_SESSION_EXPIRED_EVENT } from "./session-events";
export { getCurrentActor, loginProjectSession, logoutProjectSession } from "./auth";
export type { SessionMutationOptions } from "./auth";

export {
  createScannerPairingCode,
  listAllScannerDevices,
} from "./scanner-admin";
export type {
  DurableCallOptions,
  ListScannerDevicesParams,
} from "./scanner-admin";

/* ── 관리자 학생 현황 ──────────────────────────────────────────────────── */

export {
  campusScopedLabel,
  evaluateManualSyncGate,
  getStudentSyncStatus,
  listAdminStudents,
  listReviewRequiredStudents,
  resolveHomeroomTeacher,
  resolveStudentSummaryCounts,
  REVIEW_REASON_FALLBACK_LABEL,
  reviewReasonLabel,
  startManualStudentSync,
  studentReservationLabel,
  SYNC_ALREADY_RUNNING_CODE,
  SYNC_BLOCKED_ALREADY_RUNNING,
  SYNC_BLOCKED_CIRCUIT_OPEN,
  SYNC_BLOCKED_SOURCE_NOT_READY,
  SYNC_CIRCUIT_OPEN_CODE,
} from "./admin-students";
export type {
  AdminStudentCanonicalTeacher,
  AdminStudentReservation,
  AdminStudentReservationPage,
  ListAdminStudentsParams,
  ListReviewRequiredParams,
  ManualSyncGate,
  ManualSyncGateInput,
  ReviewReasonCode,
  ReviewRequiredResult,
  ReviewRequiredStudent,
  StartManualSyncOptions,
  StudentReservationLabel,
  StudentReservationStatus,
  StudentSummaryCounts,
} from "./admin-students";

/* ── 관리자 설명회 · 회차 ──────────────────────────────────────────────── */

export {
  listBookableSessions,
  normalizeAdminSeminarSession,
  normalizeSessionOperationsSummary,
  archiveAdminSeminarSession,
  updateAdminSeminarSession,
} from "./admin-seminars";
export type {
  ListSeminarSessionsParams,
  ListSeminarsParams,
  SeminarSessionOption,
  SeminarSessionUpdateRequest,
} from "./admin-seminars";

/* ── 관리자 가족 예약 ──────────────────────────────────────────────────── */

export {
  cancelledFamilyRebookStudentIds,
  enrolledBookingCandidates,
  listAdminSessionRoster,
  mergeRosterEventLineage,
  parseRosterUnitGroup,
  ROSTER_BOOKING_LABELS,
  ROSTER_UNIT_TABS,
  rosterBookingActionOf,
  rosterBookingControl,
  rosterContactChoices,
  rosterEventLabel,
  rosterGuestRebookPrefill,
  rosterHasActiveBooking,
  rosterHistoryTargets,
  rosterUnitGroupLabel,
  showsBranchColumn,
} from "./admin-session-roster";
export type {
  CancelledFamilyRebookResolution,
  ListSessionRosterParams,
  RosterBookingAction,
  RosterBookingControl,
  RosterBookingOption,
  RosterContactChoice,
  RosterGuestRebookPrefill,
} from "./admin-session-roster";

export {
  BOOKING_EVENT_PAGE_LIMIT_MAX,
  BOOKING_VERSION_CONFLICT_CODE,
  cancelAdminFamilyBooking,
  rollbackFamilyBookingCheckIn,
  changeTestBookingBranch,
  changeFamilyBookingAttendanceParty,
  collectFamilyBookingEvents,
  CONTACT_MAX_LENGTH,
  CONTACT_MIN_LENGTH,
  createAdminEnrolledFamilyBooking,
  createAdminGuestFamilyBooking,
  getAdminFamilyBooking,
  isValidBookingReason,
} from "./admin-family-bookings";
export type {
  AdminBookingMutationOptions,
  CancelFamilyBookingInput,
  ChangeAttendancePartyInput,
  CreateEnrolledBookingInput,
  CreateGuestBookingInput,
  ListAdminFamilyBookingsParams,
  ListBookingEventsParams,
} from "./admin-family-bookings";

/* ── 관리자 문자 ───────────────────────────────────────────────────────── */

export {
  classifySmsSendFailure,
  createSmsTemplate,
  enqueueSmsSend,
  getSmsGatewayReadiness,
  getSmsTemplatePolicy,
  isSmsSendDisabled,
  listSmsMessages,
  countSmsTargets,
  cancelSmsBatch,
  listSmsTemplates,
  previewSmsTargets,
  primarySample,
  removeSmsTemplate,
  SMS_DEFAULT_TEMPLATE_MUST_BE_ACTIVE_CODE,
  SMS_DEFAULT_TEMPLATE_REASSIGN_REQUIRED_CODE,
  SMS_TEMPLATE_KEY_CONFLICT_CODE,
  SMS_TEMPLATE_VERSION_CONFLICT_CODE,
  smsContentErrorMessage,
  smsOutcomeOf,
  smsReadinessWarning,
  smsSuccessRate,
  toSmsLogRows,
  updateSmsTemplate,
} from "./admin-sms";
export type {
  SmsTargetCounts,
  SmsAudienceCount,
  SmsBatchCancellation,
  CreateSmsTemplateInput,
  ListSmsMessagesParams,
  SmsLogRow,
  SmsOutcome,
  SmsSendFailure,
  SmsSendFailureAction,
  SmsTargetRequest,
  UpdateSmsTemplateInput,
} from "./admin-sms";

export { cancelOutcomeMessage, cancelScannerPairingCode } from "./scanner-pairing-cancel";
export type { CancelPairingCodeOutcome } from "./scanner-pairing-cancel";

export {
  claimScannerPairingCode,
  describeClientPlatform,
  isValidPairingCode,
  normalizePairingCode,
  reconcileScannerClaim,
} from "./scanner-pairing-claim";
export type { ClaimReconciliation } from "./scanner-pairing-claim";

export {
  checkInFamilyByQr,
  checkInFamilyManually,
  createScannerShiftLock,
  getCurrentScanner,
  listScannerCheckInSessions,
  listScannerManualCandidates,
  sendScannerHeartbeat,
} from "./scanner-device";


export { reconcileScannerUnpair, unpairCurrentScanner } from "./scanner-device-unpair";
export type { UnpairReconciliation } from "./scanner-device-unpair";

/* ── 공개 학부모 예약 ────────────────────────────────────────────────────── */

export { requestOtpChallenge, verifyOtpChallenge } from "./public-otp";
export type { RequestOtpInput } from "./public-otp";

/* ── 공개/관리 포스터 ────────────────────────────────────────────────────── */

export {
  getPublicPoster,
  isPosterMediaType,
  isValidPosterDescriptor,
  isValidPosterImageUrl,
  MAX_POSTER_BYTES,
  parsePosterResource,
  parseUploadedPoster,
  POSTER_ACCEPT_ATTR,
  posterFileRejectionMessage,
  posterUploadErrorMessage,
  publicPosterErrorMessage,
  uploadAdminPoster,
  validatePosterFile,
} from "./poster";
export type { PosterFileRejection } from "./poster";

export {
  cancelPublicFamilyBooking,
  createPublicFamilyBooking,
  establishFamilyBookingContactReadSession,
  exchangeBookingAccessToken,
  getPublicFamilyBooking,
  listPublicSeminarSessions,
  lookupPublicFamilyBookings,
  recoverOwnedFamilyBookingQr,
  searchAuthorizedStudents,
  seatCountFor,
  updatePublicFamilyBooking,
} from "./public-booking";
export type {
  ListPublicSessionsParams,
  ManagementSessionReadOptions,
  OwnedBookingReadAuth,
  ProofMutationOptions,
  ProofReadOptions,
  SearchAuthorizedStudentsParams,
} from "./public-booking";
