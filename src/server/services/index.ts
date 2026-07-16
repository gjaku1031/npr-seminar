import "server-only";

/**
 * server 존 공개 API (barrel) — 진입점(app 페이지 RSC · features의 Server Action)은
 * @/server/services 로만 들어온다 (ESLint R1). 리포지토리·db는 여기서 재노출하지 않는다.
 */

// 설명회 (명세 §6)
export {
  listSessions,
  listOpenSessions,
  listSessionsWithStats,
  getSession,
  getSessionStats,
  createSession,
  updateSurveySms,
  endSession,
  deleteSession,
} from "./session.service";

// 예약 (명세 §4 · §9 · §10 · §11) — 서버 불변식 적용 지점
export {
  listReservations,
  listAllReservations,
  getReservation,
  findReservationByCode,
  findReservationsByPhone,
  createReservation,
  createFamilyReservation,
  createGuestReservation,
  setRosterReservation,
  addGuestReservation,
  checkIn,
  checkInByCode,
  rollbackEntry,
  cancelReservation,
  moveReservation,
  reissueReservationCode,
  walkInCheckIn,
} from "./reservation.service";

// 재원생 (명세 §4 — 읽기 전용 참조)
export { listStudents, getStudent, findStudentsByParentPhone } from "./student.service";

// 부가 도메인 (명세 §5 · §6.4~6.5 · §9.1)
export {
  listClasses,
  listTeachers,
  getAdminUser,
  listSmsTemplates,
  createSmsTemplate,
  saveSmsTemplate,
  deleteSmsTemplate,
  listSmsLogs,
  sendGroupSms,
  sendSurveySms,
  listSurveyResponses,
  getSurveySummary,
  submitSurvey,
  submitMobileSurvey,
  listDevices,
} from "./support.service";

// 통계 (명세 §8)
export { getStatsOverview } from "./stats.service";
export type { StatsOverview, UnitStat } from "./stats.service";

// 인증 이음새 (명세 §1.1 단일 관리자) — 설계 §8
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
