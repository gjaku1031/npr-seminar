"use client";

/**
 * 콘솔 집계 어댑터 — 두 GET 엔드포인트를 소비한다:
 *   - GET /admin/seminar-sessions/{id}/operations-summary  (운영: 가족 예약 건수 요약)
 *   - GET /admin/seminar-sessions/{id}/statistics          (통계: 단위·채널 분해까지)
 *
 * ★ 배포 서버는 이 엔드포인트를 실제로 준다 — 응답의 **정확한 계약 모양**을 그대로 소비한다.
 *   operations-summary: {activeBookingCount, checkedInBookingCount, uncheckedBookingCount,
 *   cancelledBookingCount, noShowBookingCount}. 여기서 active = RESERVED+CHECKED_IN 이고
 *   NO_SHOW 는 제외다. statistics: {branch, summary, units[], channels[], survey}.
 *
 * ★ 아직 안 붙은 배포(404/501)를 대비한 **graceful fallback** 만 남긴다: 계약이 이미 주는 값
 *   (상태별 예약 건수·설문 summary)만 병렬로 세어 합성한다. 합성 active 도 반드시
 *   **RESERVED+CHECKED_IN 만**이며 NO_SHOW 를 절대 포함하지 않는다. 그리고 단위·채널 분해는
 *   목록에 unitName·bookingSource 필터가 없어 만들 수 없으므로 **null** 로 두고 화면이 정직하게
 *   비운다 — 한 페이지를 전체인 척, 없는 분해를 있는 척하지 않는다.
 *
 * CSRF/세션은 공용 `apiRequest`(same-origin 쿠키 + 필요 시 X-CSRF-Token)를 그대로 탄다.
 */

import { apiRequest } from "./client";
import { countAdminFamilyBookings } from "./admin-family-bookings";
import { listSessionSurveyResponses } from "./admin-seminars";
import { isApiError } from "./problem";
import type { Branch, ParticipationMonitoring } from "./contract";

/** 이 값이 서버 집계에서 왔는지, 배포 전이라 기존 엔드포인트로 합성했는지. */
export type AggregateSource = "server" | "derived";

/**
 * 아직 안 붙은 엔드포인트인가 — **404/501 만** fallback 사유로 본다.
 * 401·403·409·500·네트워크는 진짜 실패이므로 그대로 던져 화면이 오류로 다뤄야 한다
 * (없는 척 합성하면 권한·서버 문제를 정상처럼 가린다).
 */
export function isAggregateEndpointUnavailable(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 501);
}

/* ── 운영 요약 (Sessions 화면) ─────────────────────────────────────────── */

/** 가족 예약 **건수** 기준 요약(좌석이 아니다). NO_SHOW 는 total/미체크/취소 어디에도 안 들어간다. */
export interface SessionOperationsSummary {
  source: AggregateSource;
  /** 총 예약 = RESERVED + CHECKED_IN (NO_SHOW 제외). */
  activeCount: number;
  /** 입장 완료 = CHECKED_IN. */
  checkedInCount: number;
  /** 미체크 = active 중 아직 입장 안 함 = RESERVED. */
  uncheckedCount: number;
  /** 취소 = CANCELLED. */
  cancelledCount: number;
  /** 내부 노쇼 = NO_SHOW. total/미체크/취소에 섞지 않는다. */
  noShowCount: number;
}

/** operations-summary 의 **정확한 서버 응답 모양**. */
interface OperationsSummaryResponse {
  activeBookingCount: number;
  checkedInBookingCount: number;
  uncheckedBookingCount: number;
  cancelledBookingCount: number;
  noShowBookingCount: number;
}

/** 서버 응답(정확한 계약 모양) → 화면 요약. active 는 서버가 이미 RESERVED+CHECKED_IN 로 센 값이다. */
export function operationsSummaryFromServer(body: OperationsSummaryResponse): SessionOperationsSummary {
  return {
    source: "server",
    activeCount: body.activeBookingCount,
    checkedInCount: body.checkedInBookingCount,
    uncheckedCount: body.uncheckedBookingCount,
    cancelledCount: body.cancelledBookingCount,
    noShowCount: body.noShowBookingCount,
  };
}

/** fallback 이 계약 목록으로 센 상태별 가족 예약 건수. */
interface FamilyBookingStatusCounts {
  reservedCount: number;
  checkedInCount: number;
  noShowCount: number;
  cancelledCount: number;
}

/**
 * 순수 합성 — 상태별 건수에서 요약을 만든다.
 * active = reserved + checkedIn (**NO_SHOW 절대 제외**), unchecked = reserved(입장 대기).
 */
export function operationsSummaryFrom(
  counts: FamilyBookingStatusCounts,
  source: AggregateSource,
): SessionOperationsSummary {
  return {
    source,
    activeCount: counts.reservedCount + counts.checkedInCount,
    checkedInCount: counts.checkedInCount,
    uncheckedCount: counts.reservedCount,
    cancelledCount: counts.cancelledCount,
    noShowCount: counts.noShowCount,
  };
}

export interface UnitStat {
  /** 표시 라벨(전체·초등·중1…). 서버가 라벨을 정한다. */
  unit: string;
  /** 활성 예약 = RESERVED + CHECKED_IN. */
  activeCount: number;
  /** 참석(입장 완료) = CHECKED_IN. */
  checkedInCount: number;
  /** 학생 행·형제 제외 가족·실 참가 학부모의 절대 수. 이전 API 응답이면 null. */
  monitoring: ParticipationMonitoring | null;
}

/** 채널별 활성 예약 — 모바일(MOBILE) / 수동(MANUAL). 도넛은 활성 건수로 그린다. */
export interface ChannelBreakdown {
  mobileCount: number;
  manualCount: number;
}

/** 모바일/수동 채널별 절대 집계. 비율을 만들지 않고 세 수치를 그대로 보여 준다. */
export interface ChannelStat {
  channel: "MOBILE" | "MANUAL";
  bookingSources: string[];
  monitoring: ParticipationMonitoring | null;
  activeCount: number;
  checkedInCount: number;
  cancelledCount: number;
}

/** 통계 화면이 쓰는 설문 요약 — statistics.survey(회차 전체 기준)에서 온다. */
export interface StatisticsSurvey {
  /** 응답이 없으면 null — 0 이 아니다. */
  averageRating: number | null;
  responseCount: number;
}

export interface SessionStatistics {
  source: AggregateSource;
  /** 현재 회차·캠퍼스 범위의 학생/가족/실 참가자 절대 집계. */
  monitoring: ParticipationMonitoring | null;
  /** 총 예약 = RESERVED + CHECKED_IN. */
  activeCount: number;
  /** 입장 완료 = CHECKED_IN. */
  checkedInCount: number;
  /** 아직 입장하지 않은 활성 가족 예약 = RESERVED. */
  reservedCount: number;
  /** 취소된 가족 예약. */
  cancelledCount: number;
  /** 내부 노쇼 = NO_SHOW. 활성 예약·참가자 집계에는 포함하지 않는다. */
  noShowCount: number;
  /** 회차 전체 기준 — 설문은 캠퍼스로 나뉘지 않는다. */
  survey: StatisticsSurvey;
  /** 서버 집계에만 있다 — derived fallback 에선 null(화면이 "연결 예정"으로 비운다). */
  units: UnitStat[] | null;
  channels: ChannelBreakdown | null;
  channelStats: ChannelStat[] | null;
}

/** statistics 응답의 summary(정확한 서버 모양). */
interface StatisticsSummaryResponse {
  monitoring: ParticipationMonitoring;
  activeBookingCount: number;
  reservedBookingCount: number;
  checkedInBookingCount: number;
  cancelledBookingCount: number;
  noShowBookingCount: number;
}

/** statistics 응답의 units[] 한 원소(정확한 서버 모양). */
interface StatisticsUnitResponse {
  monitoring: ParticipationMonitoring;
  unitGroup: string;
  activeBookingCount: number;
  reservedBookingCount: number;
  checkedInBookingCount: number;
}

/** statistics 응답의 channels[] 한 원소(정확한 서버 모양). */
interface StatisticsChannelResponse {
  monitoring: ParticipationMonitoring;
  channel: "MOBILE" | "MANUAL";
  bookingSources: string[];
  activeBookingCount: number;
  reservedBookingCount: number;
  checkedInBookingCount: number;
  cancelledBookingCount: number;
  noShowBookingCount: number;
}

/** statistics 의 **정확한 서버 응답 모양** 전체. */
interface StatisticsResponse {
  branch: Branch | null;
  summary: StatisticsSummaryResponse;
  units: StatisticsUnitResponse[];
  channels: StatisticsChannelResponse[];
  survey: { averageRating: number | null; responseCount: number; scope: "SESSION" };
}

/** 채널 배열 → 모바일/수동 **활성** 건수 합. MOBILE·MANUAL 외 값은 무시한다. */
export function channelBreakdownFrom(channels: StatisticsChannelResponse[]): ChannelBreakdown {
  let mobileCount = 0;
  let manualCount = 0;
  for (const channel of channels) {
    if (channel.channel === "MOBILE") mobileCount += channel.activeBookingCount;
    else if (channel.channel === "MANUAL") manualCount += channel.activeBookingCount;
  }
  return { mobileCount, manualCount };
}

/** 서버 응답(정확한 계약 모양) → 화면 통계. active/reserved/checkedIn 는 서버가 센 값 그대로. */
export function statisticsFromServer(body: StatisticsResponse): SessionStatistics {
  return {
    source: "server",
    monitoring: body.summary.monitoring,
    activeCount: body.summary.activeBookingCount,
    checkedInCount: body.summary.checkedInBookingCount,
    reservedCount: body.summary.reservedBookingCount,
    cancelledCount: body.summary.cancelledBookingCount,
    noShowCount: body.summary.noShowBookingCount,
    survey: { averageRating: body.survey.averageRating, responseCount: body.survey.responseCount },
    units: body.units.map((unit) => ({
      unit: unit.unitGroup,
      activeCount: unit.activeBookingCount,
      checkedInCount: unit.checkedInBookingCount,
      monitoring: unit.monitoring,
    })),
    channels: channelBreakdownFrom(body.channels),
    channelStats: body.channels.map((channel) => ({
      channel: channel.channel,
      bookingSources: channel.bookingSources,
      monitoring: channel.monitoring,
      activeCount: channel.activeBookingCount,
      checkedInCount: channel.checkedInBookingCount,
      cancelledCount: channel.cancelledBookingCount,
    })),
  };
}

/** fallback 합성 입력 — 계약 목록으로 센 요약 원자료. */
interface StatisticsDerivedCounts {
  reservedCount: number;
  checkedInCount: number;
  noShowCount: number;
  cancelledCount: number;
}

/**
 * 순수 합성(derived) — 요약 5개 지표와 설문만 채우고 단위·채널은 **null**(목록에 필터가 없어
 * 못 만든다). active = reserved + checkedIn (**NO_SHOW 절대 제외**).
 */
export function statisticsSummaryFrom(
  counts: StatisticsDerivedCounts,
  survey: StatisticsSurvey,
): SessionStatistics {
  return {
    source: "derived",
    monitoring: null,
    activeCount: counts.reservedCount + counts.checkedInCount,
    checkedInCount: counts.checkedInCount,
    reservedCount: counts.reservedCount,
    cancelledCount: counts.cancelledCount,
    noShowCount: counts.noShowCount,
    survey,
    units: null,
    channels: null,
    channelStats: null,
  };
}

export async function getSessionStatistics(
  seminarSessionId: string,
  branch: Branch | null,
  signal?: AbortSignal,
): Promise<SessionStatistics> {
  try {
    const body = await apiRequest<StatisticsResponse>(
      `/admin/seminar-sessions/${encodeURIComponent(seminarSessionId)}/statistics`,
      { method: "GET", query: { branch: branch ?? undefined }, signal },
    );
    return statisticsFromServer(body);
  } catch (error) {
    if (!isAggregateEndpointUnavailable(error)) throw error;
    // 폴백: 계약이 이미 주는 값만 합성한다. 단위·채널은 목록에 필터가 없어 못 만든다 → null.
    const [reservedCount, checkedInCount, noShowCount, cancelledCount, surveyPage] = await Promise.all([
      countAdminFamilyBookings(bookingFilter(seminarSessionId, branch, "RESERVED"), signal),
      countAdminFamilyBookings(bookingFilter(seminarSessionId, branch, "CHECKED_IN"), signal),
      countAdminFamilyBookings(bookingFilter(seminarSessionId, branch, "NO_SHOW"), signal),
      countAdminFamilyBookings(bookingFilter(seminarSessionId, branch, "CANCELLED"), signal),
      listSessionSurveyResponses(seminarSessionId, { pageSize: 1 }, signal),
    ]);
    return statisticsSummaryFrom(
      { reservedCount, checkedInCount, noShowCount, cancelledCount },
      { averageRating: surveyPage.summary.averageRating, responseCount: surveyPage.summary.responseCount },
    );
  }
}

/** branch 가 null 이면 필터에서 아예 뺀다(빈 값을 보내지 않는다). */
function bookingFilter(
  sessionId: string,
  branch: Branch | null,
  status: "RESERVED" | "CHECKED_IN" | "NO_SHOW" | "CANCELLED",
): { sessionId: string; branch?: Branch; status: "RESERVED" | "CHECKED_IN" | "NO_SHOW" | "CANCELLED" } {
  return branch === null ? { sessionId, status } : { sessionId, branch, status };
}
