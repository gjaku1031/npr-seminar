/**
 * 집계 어댑터의 **순수한 심장**만 직접 본다 (node:test + tsx).
 * fetch 를 타는 부분(getSessionOperationsSummary/getSessionStatistics)은 훅·통합에서 다루고,
 * 여기서는 서버 응답 매핑·합성 규칙·"엔드포인트 없음" 판정만 값으로 확인한다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  channelBreakdownFrom,
  isAggregateEndpointUnavailable,
  operationsSummaryFrom,
  operationsSummaryFromServer,
  statisticsFromServer,
  statisticsSummaryFrom,
} from "./admin-operations";
import { ApiError } from "./problem";

describe("operationsSummaryFromServer — operations-summary 의 정확한 모양을 그대로 소비한다", () => {
  it("서버 필드를 화면 요약으로 매핑한다(active 는 서버가 준 값 그대로)", () => {
    const summary = operationsSummaryFromServer({
      activeBookingCount: 18,
      checkedInBookingCount: 7,
      uncheckedBookingCount: 11,
      cancelledBookingCount: 4,
      noShowBookingCount: 2,
    });
    assert.equal(summary.source, "server");
    assert.equal(summary.activeCount, 18);
    assert.equal(summary.checkedInCount, 7);
    assert.equal(summary.uncheckedCount, 11);
    assert.equal(summary.cancelledCount, 4);
    assert.equal(summary.noShowCount, 2);
  });
});

describe("operationsSummaryFrom — 합성 active 는 NO_SHOW 를 절대 포함하지 않는다", () => {
  it("active = reserved + checkedIn, unchecked = reserved (노쇼·취소 제외)", () => {
    const summary = operationsSummaryFrom(
      { reservedCount: 11, checkedInCount: 7, noShowCount: 3, cancelledCount: 5 },
      "derived",
    );
    assert.equal(summary.activeCount, 18); // 11 + 7 — 노쇼 3 은 빠진다
    assert.equal(summary.uncheckedCount, 11);
    assert.equal(summary.checkedInCount, 7);
    assert.equal(summary.cancelledCount, 5);
    assert.equal(summary.noShowCount, 3);
    assert.equal(summary.source, "derived");
  });

  it("source 는 그대로 실린다 — 서버 집계와 합성값을 구분한다", () => {
    const summary = operationsSummaryFrom(
      { reservedCount: 0, checkedInCount: 0, noShowCount: 0, cancelledCount: 0 },
      "server",
    );
    assert.equal(summary.source, "server");
    assert.equal(summary.activeCount, 0);
  });
});

describe("channelBreakdownFrom — MOBILE/MANUAL 활성 건수만 합산한다", () => {
  it("채널별 activeBookingCount 를 모바일/수동으로 나눈다", () => {
    const breakdown = channelBreakdownFrom([
      {
        channel: "MOBILE",
        bookingSources: ["WEB_APP"],
        activeBookingCount: 30,
        reservedBookingCount: 20,
        checkedInBookingCount: 10,
        cancelledBookingCount: 2,
        noShowBookingCount: 1,
      },
      {
        channel: "MANUAL",
        bookingSources: ["ADMIN_CONSOLE", "PHONE"],
        activeBookingCount: 12,
        reservedBookingCount: 9,
        checkedInBookingCount: 3,
        cancelledBookingCount: 0,
        noShowBookingCount: 0,
      },
    ]);
    assert.deepEqual(breakdown, { mobileCount: 30, manualCount: 12 });
  });

  it("빈 배열이면 0/0 이다", () => {
    assert.deepEqual(channelBreakdownFrom([]), { mobileCount: 0, manualCount: 0 });
  });
});

describe("statisticsFromServer — statistics 의 정확한 모양을 그대로 소비한다", () => {
  it("summary·units·channels·survey 를 화면 통계로 매핑한다", () => {
    const stats = statisticsFromServer({
      branch: "CAMPUS_A",
      summary: {
        eligibleCurrentStudentCount: 500,
        activeBookingCount: 180,
        reservedBookingCount: 120,
        checkedInBookingCount: 60,
        cancelledBookingCount: 15,
        noShowBookingCount: 9,
      },
      units: [
        {
          unitGroup: "전체",
          eligibleStudentCount: 500,
          activeBookingCount: 180,
          reservedBookingCount: 120,
          checkedInBookingCount: 60,
        },
        {
          unitGroup: "중1",
          eligibleStudentCount: 80,
          activeBookingCount: 40,
          reservedBookingCount: 25,
          checkedInBookingCount: 15,
        },
      ],
      channels: [
        {
          channel: "MOBILE",
          bookingSources: ["WEB_APP"],
          activeBookingCount: 150,
          reservedBookingCount: 100,
          checkedInBookingCount: 50,
          cancelledBookingCount: 10,
          noShowBookingCount: 7,
        },
        {
          channel: "MANUAL",
          bookingSources: ["ADMIN_CONSOLE"],
          activeBookingCount: 30,
          reservedBookingCount: 20,
          checkedInBookingCount: 10,
          cancelledBookingCount: 5,
          noShowBookingCount: 2,
        },
      ],
      survey: { averageRating: 4.4, responseCount: 42, scope: "SESSION" },
    });

    assert.equal(stats.source, "server");
    assert.equal(stats.eligibleStudentCount, 500);
    assert.equal(stats.activeCount, 180);
    assert.equal(stats.checkedInCount, 60);
    assert.equal(stats.noShowCount, 9);
    assert.deepEqual(stats.survey, { averageRating: 4.4, responseCount: 42 });
    assert.deepEqual(stats.channels, { mobileCount: 150, manualCount: 30 });
    assert.deepEqual(stats.units, [
      { unit: "전체", eligibleStudentCount: 500, activeCount: 180, checkedInCount: 60 },
      { unit: "중1", eligibleStudentCount: 80, activeCount: 40, checkedInCount: 15 },
    ]);
  });
});

describe("statisticsSummaryFrom — 합성 통계는 active 에서 NO_SHOW 를 빼고 단위·채널을 지어내지 않는다", () => {
  it("active = reserved + checkedIn, units/channels = null", () => {
    const stats = statisticsSummaryFrom(
      { eligibleStudentCount: 300, reservedCount: 90, checkedInCount: 40, noShowCount: 12 },
      { averageRating: null, responseCount: 0 },
    );
    assert.equal(stats.source, "derived");
    assert.equal(stats.eligibleStudentCount, 300);
    assert.equal(stats.activeCount, 130); // 90 + 40 — 노쇼 12 는 빠진다
    assert.equal(stats.checkedInCount, 40);
    assert.equal(stats.noShowCount, 12);
    assert.equal(stats.units, null);
    assert.equal(stats.channels, null);
    assert.deepEqual(stats.survey, { averageRating: null, responseCount: 0 });
  });
});

describe("isAggregateEndpointUnavailable — 404/501 만 폴백 사유다", () => {
  const err = (status: number) =>
    new ApiError({ kind: status >= 500 ? "unexpected" : "problem", status, code: `HTTP_${status}`, message: "x" });

  it("아직 안 붙은 엔드포인트(404·501)는 폴백한다", () => {
    assert.equal(isAggregateEndpointUnavailable(err(404)), true);
    assert.equal(isAggregateEndpointUnavailable(err(501)), true);
  });

  it("진짜 실패(401·403·409·500·503)는 폴백하지 않고 던진다", () => {
    for (const status of [401, 403, 409, 500, 503]) {
      assert.equal(isAggregateEndpointUnavailable(err(status)), false, `status ${status}`);
    }
  });

  it("ApiError 가 아니면 폴백 대상이 아니다", () => {
    assert.equal(isAggregateEndpointUnavailable(new Error("boom")), false);
    assert.equal(isAggregateEndpointUnavailable(null), false);
    assert.equal(isAggregateEndpointUnavailable(undefined), false);
  });
});
