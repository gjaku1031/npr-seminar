"use client";

/**
 * 명단 한 행의 **예약 이력 계보** — 열었을 때만 읽는다.
 *
 * 한 학생의 이력이 가족 예약 집계 하나에만 있다는 보장이 없다: 취소한 뒤 다시 예약하면
 * 새 집계가 생기고 옛 집계의 기록은 그대로 남는다(그래서 계약이 `bookingHistory` 를
 * 배열로 준다). 이 훅은 그 집계들을 **열었을 때 한꺼번에** 읽어 하나의 시간순 계보로 잇는다.
 *
 * ★ 목록을 그릴 때는 아무것도 부르지 않는다 — 행마다 미리 읽으면 한 페이지가 곧 N+1 이다.
 *   그래서 조회 신원은 "지금 열려 있는 행" 하나뿐이고, 닫히면 요청이 없다.
 *
 * ★ 이력은 sequence **오름차순** 커서 페이지네이션이다. 첫 페이지만 읽으면 손에 남는 건
 *   *가장 오래된* 기록이므로, 집계마다 `hasMore` 가 false 가 될 때까지 커서를 따라 **끝까지**
 *   읽는다. 집계끼리는 서로 독립이라 병렬로, 한 집계 안에서는 커서가 순서를 강제하므로 순차로.
 *   중간에 끊기면(커서가 없거나 제자리) 잘린 목록을 전부인 척하지 않고 오류로 끝낸다.
 */

import { useCallback, useEffect, useState } from "react";
import { collectFamilyBookingEvents, mergeRosterEventLineage, rosterHistoryTargets } from "@/shared/api";
import type { BookingAuditEvent, SessionRosterBookingHistoryReference } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export interface RosterEventLineageState {
  /** 과거→현재 시간순으로 병합된 **전체** 계보. eventId 중복은 이미 걷혔다. */
  events: BookingAuditEvent[];
  loading: boolean;
  error: string | null;
  /** 계보가 걸쳐 있는 가족 예약 수 (1보다 크면 취소 뒤 재예약이다). */
  aggregateCount: number;
  reload: () => void;
}

const EMPTY: readonly SessionRosterBookingHistoryReference[] = [];

/**
 * @param history 열려 있는 행의 `bookingHistory`. null 이면 닫힌 상태 — 아무 요청도 없다.
 */
export function useRosterEventLineage(
  history: readonly SessionRosterBookingHistoryReference[] | null,
): RosterEventLineageState {
  const [snapshot, setSnapshot] = useState<{
    key: string;
    events: BookingAuditEvent[];
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const targets = rosterHistoryTargets(history ?? EMPTY);
  // 대상 집계 목록이 곧 신원이다 — 배열 정체성이 아니라 값으로 비교해야 매 렌더 다시 부르지 않는다.
  const targetIds = targets.map((target) => target.familyBookingId).join(",");
  const requestKey = `${targetIds}:${reloadToken}`;
  const open = history !== null;

  // 이력이 아예 없는 행은 부를 곳이 없다 — 요청도, 로딩도 없이 빈 계보로 끝난다.
  const nothingToFetch = targetIds === "";

  useEffect(() => {
    if (!open || nothingToFetch) return;

    const controller = new AbortController();
    const ids = targetIds.split(",");

    void (async () => {
      try {
        // 집계는 보통 1~2개다. 한 행을 열 때만 도는 병렬 호출이라 목록 로드에는 영향이 없다.
        // 집계 하나 안에서는 collectFamilyBookingEvents 가 커서를 순차로 따라 끝까지 읽는다.
        const groups = await Promise.all(
          ids.map((familyBookingId) => collectFamilyBookingEvents(familyBookingId, controller.signal)),
        );
        if (controller.signal.aborted) return;
        setSnapshot({ key: requestKey, events: mergeRosterEventLineage(groups), error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 한 집계라도 끝까지 못 읽으면 계보 전체가 불완전하다 — 반쪽을 전부인 척 보여 주지 않는다.
        setSnapshot({ key: requestKey, events: [], error: defaultErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [open, nothingToFetch, targetIds, requestKey]);

  const fresh = snapshot !== null && snapshot.key === requestKey;
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    events: fresh ? snapshot.events : [],
    loading: open && !nothingToFetch && !fresh,
    error: fresh ? snapshot.error : null,
    aggregateCount: targets.length,
    reload,
  };
}
