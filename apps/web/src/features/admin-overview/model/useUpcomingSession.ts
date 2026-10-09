"use client";

/**
 * 아직 끝나지 않은 회차 중 가장 이른 것 — "지금" 을 렌더 중에 읽지 않음
 *
 * `Date.now()` 는 렌더마다 다른 값을 주는 불순 함수라 렌더 도중에 부르면 결과가 언제
 * 갱신될지 예측할 수 없음. 그래서 선택은 이펙트에서만 하고 렌더는 그 결과만 읽음
 * 시각이 흘러 대상이 바뀌는 것까지 따라가려고 주기적으로 다시 고름
 */

import { useEffect, useState } from "react";
import type { SeminarSessionOption, SeminarSessionStatus } from "@/shared/api";

/**
 * 회차 경계는 분 단위로 충분함 — 더 자주 깨울 이유가 없음
 */
const RECHECK_INTERVAL_MS = 60_000;

/**
 * 실제로 사람이 입장할 수 있는 회차 상태
 *
 * CLOSED 는 예약이 마감된 것이지 회차가 취소된 게 아님 — 설명회 당일에는 예약 창구가
 * 닫혀 있는 게 정상이라 스캔 대상은 대개 이 상태임. 반대로 DRAFT 는 아직 공개되지 않았고
 * CANCELLED/ARCHIVED 는 열리지 않음 — 스캔 대상으로 고르면 현장에 없는 회차를 가리킴
 */
const OPERABLE_STATUSES: ReadonlySet<SeminarSessionStatus> = new Set<SeminarSessionStatus>([
  "OPEN",
  "CLOSED",
]);

/**
 * 선택지 중 가장 가까운 예정 회차. 없으면 null
 */
export function useUpcomingSession(options: SeminarSessionOption[]): SeminarSessionOption | null {
  const [target, setTarget] = useState<SeminarSessionOption | null>(null);

  useEffect(() => {
    const pick = () => {
      const now = Date.now();
      // 목록은 시작 시각 오름차순이라 먼저 걸리는 것이 가장 이른 회차임
      setTarget(
        options.find(
          (option) =>
            OPERABLE_STATUSES.has(option.session.status) && Date.parse(option.session.endsAt) >= now,
        ) ?? null,
      );
    };

    pick();
    const timer = window.setInterval(pick, RECHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [options]);

  return target;
}
