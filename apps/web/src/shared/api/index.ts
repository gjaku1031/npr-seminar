/**
 * 브라우저 전용 Nest API 어댑터 공개 API.
 * 계약(packages/contracts/openapi.yaml)만 보고 만든다 — `apps/api` 를 import 하지 않는다.
 */

export { apiRequest, bootstrapCsrf, resetCsrfToken } from "./client";
export type { ApiMethod, ApiRequestOptions } from "./client";

export { ApiError, defaultErrorMessage, isAborted, isApiError } from "./problem";
export type { Problem, ProblemFieldError } from "./problem";

// 키 생성 함수는 내보내지 않는다 — 수명을 관리하는 훅을 통해서만 키를 얻는다.
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

export { loginProjectSession, logoutProjectSession } from "./auth";
export type { SessionMutationOptions } from "./auth";

export {
  createScannerPairingCode,
  getScannerDevice,
  listAllScannerDevices,
  listScannerDevices,
  reconcileScannerRevoke,
  revokeScannerDevice,
} from "./scanner-admin";
export type {
  DurableCallOptions,
  ListScannerDevicesParams,
  RevokeReconciliation,
} from "./scanner-admin";

/* ── 관리자 학생 현황 ──────────────────────────────────────────────────── */

export {
  campusScopedLabel,
  countAdminStudents,
  evaluateManualSyncGate,
  getStudentSyncStatus,
  isValidSyncReason,
  listAdminStudents,
  listReviewRequiredStudents,
  resolveHomeroomTeacher,
  resolveStudentSummaryCounts,
  REVIEW_REASON_FALLBACK_LABEL,
  REVIEW_REASON_LABELS,
  reviewReasonLabel,
  startManualStudentSync,
  studentReservationLabel,
  SYNC_ALREADY_RUNNING_CODE,
  SYNC_BLOCKED_ALREADY_RUNNING,
  SYNC_BLOCKED_CIRCUIT_OPEN,
  SYNC_BLOCKED_SOURCE_NOT_READY,
  SYNC_CIRCUIT_OPEN_CODE,
  SYNC_REASON_MAX_LENGTH,
  SYNC_REASON_MIN_LENGTH,
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
  listAdminSeminars,
  listBookableSessions,
  listSeminarSessions,
  listSessionSurveyResponses,
  normalizeAdminSeminarSession,
  normalizeSessionOperationsSummary,
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
  ACTIVE_BOOKING_EXISTS_CODE,
  BOOKING_NOT_EDITABLE_CODE,
  BOOKING_REASON_MAX_LENGTH,
  BOOKING_EVENT_PAGE_LIMIT_MAX,
  BOOKING_REASON_MIN_LENGTH,
  BOOKING_VERSION_CONFLICT_CODE,
  cancelAdminFamilyBooking,
  changeFamilyBookingAttendanceParty,
  collectFamilyBookingEvents,
  CONTACT_MAX_LENGTH,
  CONTACT_MIN_LENGTH,
  countAdminFamilyBookings,
  createAdminEnrolledFamilyBooking,
  createAdminGuestFamilyBooking,
  getAdminFamilyBooking,
  isValidBookingReason,
  listAdminFamilyBookings,
  listFamilyBookingEvents,
  STUDENT_CONTACT_MISMATCH_CODE,
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
  archiveSmsTemplate,
  classifySmsSendFailure,
  createSmsTemplate,
  enqueueSmsSend,
  getSmsGatewayReadiness,
  isLastActiveTemplate,
  isSmsSendDisabled,
  listSmsMessages,
  listSmsTemplates,
  previewSmsTargets,
  primarySample,
  SMS_LAST_ACTIVE_TEMPLATE_REQUIRED_CODE,
  SMS_PREVIEW_TOKEN_CHANGED_CODE,
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
  getCurrentScannerShift,
  listScannerCheckInSessions,
  listScannerManualCandidates,
  sendScannerHeartbeat,
} from "./scanner-device";

export { releaseCurrentScannerShift } from "./scanner-shift-release";
export type { ReleaseShiftOutcome } from "./scanner-shift-release";

export { reconcileScannerUnpair, unpairCurrentScanner } from "./scanner-device-unpair";
export type { UnpairReconciliation } from "./scanner-device-unpair";

/* ── 공개 학부모 예약 ────────────────────────────────────────────────────── */

export { requestOtpChallenge, verifyOtpChallenge } from "./public-otp";
export type { RequestOtpInput } from "./public-otp";

export {
  cancelPublicFamilyBooking,
  createPublicFamilyBooking,
  exchangeBookingAccessToken,
  getPublicFamilyBooking,
  listOwnedFamilyBookings,
  listPublicSeminarSessions,
  recoverOwnedFamilyBookingQr,
  searchAuthorizedStudents,
  seatCountFor,
  submitFamilyBookingSurveyResponse,
  updatePublicFamilyBooking,
} from "./public-booking";
export type {
  ListPublicSessionsParams,
  ManagementSessionMutationOptions,
  ManagementSessionReadOptions,
  OwnedBookingMutationAuth,
  OwnedBookingReadAuth,
  ProofMutationOptions,
  ProofReadOptions,
  SearchAuthorizedStudentsParams,
} from "./public-booking";
