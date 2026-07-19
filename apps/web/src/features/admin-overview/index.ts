// features/admin-overview 공개 API (barrel).
// 계약이 집계 엔드포인트를 주지 않는 화면(허브·운영·통계)이 공유하는 읽기 훅 모음이다.

export { useSeminarSessions } from "./model/useSeminarSessions";
export type { SeminarSessionsState } from "./model/useSeminarSessions";

export { useGuestBookingToggle } from "./model/useGuestBookingToggle";
export type { GuestBookingToggleState } from "./model/useGuestBookingToggle";

export { useHubSummary } from "./model/useHubSummary";
export type { HubSummary, HubSummaryState } from "./model/useHubSummary";

// 운영·통계는 아직 계약에 없는 집계 엔드포인트를 미리 붙인 어댑터를 쓴다(graceful fallback).
export { useSessionOperations } from "./model/useSessionOperations";
export type { SessionOperationsState } from "./model/useSessionOperations";

export { useSessionStatistics } from "./model/useSessionStatistics";
export type { SessionStatisticsState } from "./model/useSessionStatistics";

// 어댑터가 돌려주는 집계 타입 — 화면이 값의 출처(server/derived)와 분해 유무를 읽는다.
export type {
  AggregateSource,
  ChannelBreakdown,
  SessionOperationsSummary,
  SessionStatistics,
  UnitStat,
} from "@/shared/api/admin-operations";

export { useSessionSurvey } from "./model/useSessionSurvey";
export type { SessionSurveyState } from "./model/useSessionSurvey";

export { useUpcomingSession } from "./model/useUpcomingSession";
