import "server-only";

/**
 * server 존 공개 API (barrel) — 진입점(app 페이지 RSC · features의 Server Action)은
 * @/server/services 로만 들어온다 (ESLint R1). 리포지토리·db는 여기서 재노출하지 않는다.
 */

// 설명회 (명세 §7)
export {
  listSessions,
  listOpenSessions,
  listSessionsWithStats,
  getSession,
  getSessionStats,
  createSession,
  toggleReminder,
  endSession,
  deleteSession,
} from "./session.service";

// 예약 (명세 §5 · §7.5 · §8 · §10) — 서버 불변식 적용 지점
export {
  listReservations,
  getReservation,
  findReservationByCode,
  findReservationsByPhone,
  createReservation,
  createFamilyReservation,
  checkIn,
  checkInByCode,
  rollbackEntry,
  cancelReservation,
  moveReservation,
  reissueReservationCode,
  walkInCheckIn,
} from "./reservation.service";

// 재원생 (명세 §4 · 12.14)
export {
  listStudents,
  getStudent,
  findStudentsByParentPhone,
  addStudent,
  importStudents,
  convertGuest,
} from "./student.service";

// 부가 도메인 (명세 §6 · 12.7 · 12.10 · §8.1)
export {
  listClasses,
  listClassesByTeacher,
  listTeachers,
  listUsersByRole,
  listSmsTemplates,
  createSmsTemplate,
  saveSmsTemplate,
  listSmsLogs,
  sendSms,
  listSurveyResponses,
  getSurveySummary,
  submitSurvey,
  listCounselSlots,
  listCounselBookings,
  bookCounsel,
  listDevices,
} from "./support.service";

// 통계 (명세 12.6)
export { getStatsOverview } from "./stats.service";
export type { StatsOverview } from "./stats.service";

// 인증·권한 이음새 (명세 12.1 · flows GANGSA-G1) — 설계 §8
export {
  currentUser,
  requireModuleAccess,
  assertModuleAccess,
  signIn,
  signOut,
  ROLE_COOKIE,
} from "./auth.service";

// 도메인 에러 — Server Action이 잡아 사용자 메시지로 변환한다 (설계 §7)
export {
  DomainError,
  DuplicateReservationError,
  CapacityExceededError,
  NotFoundError,
  InvalidStateError,
  ForbiddenError,
  isDomainError,
} from "./errors";
