// features/admin-overview 공개 API (barrel).
// 계약이 집계 엔드포인트를 주지 않는 화면(운영·통계)이 공유하는 읽기 훅 모음이다.

export { useSeminarSessions } from "./model/useSeminarSessions";
export type { SeminarSessionsState } from "./model/useSeminarSessions";

export { useGuestBookingToggle } from "./model/useGuestBookingToggle";
export type { GuestBookingToggleState } from "./model/useGuestBookingToggle";

// 통계는 아직 계약에 없는 집계 엔드포인트를 미리 붙인 어댑터를 쓴다(graceful fallback).
export { useSessionStatistics } from "./model/useSessionStatistics";
export type { SessionStatisticsState } from "./model/useSessionStatistics";

// 어댑터가 돌려주는 집계 타입 — 화면이 값의 출처(server/derived)와 분해 유무를 읽는다.
export type {
  AggregateSource,
  ChannelBreakdown,
  ChannelStat,
  SessionOperationsSummary,
  SessionStatistics,
  UnitStat,
} from "@/shared/api/admin-operations";


export { useUpcomingSession } from "./model/useUpcomingSession";
export { useSessionLifecycle } from "./model/useSessionLifecycle";
export type { SessionLifecycleAction, SessionLifecycleState } from "./model/useSessionLifecycle";
export { SessionLifecycleDialog } from "./ui/SessionLifecycleDialog";
export { LiveCheckInLog } from "./ui/LiveCheckInLog";
