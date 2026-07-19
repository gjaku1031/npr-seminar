"use client";

/**
 * 가족 예약 감사 이력 — **모달을 열 때만** 그 한 건을 읽는다.
 *
 * 행마다 미리 읽으면 명단 한 페이지가 곧 N+1 요청이다. 그래서 조회 신원은
 * "지금 열려 있는 familyBookingId" 하나뿐이고, 닫히면 아무것도 부르지 않는다.
 *
 * 이력은 계약 커서(afterSequence)로 이어 읽는다. 첫 페이지만 읽고 전부인 척하면
 * 이력이 조용히 잘린다 — 그래서 `hasMore` 를 그대로 노출하고 더 읽기는 사용자가 요청할
 * 때만 한다. 전부를 한 번에 긁지 않는 이유도 같다: 이력은 길이 상한이 없다.
 *
 * ★ 순서는 계약대로 **sequence 오름차순(과거→현재)** 그대로 둔다. 커서가 sequence 를
 *   거슬러 올라가는 게 아니라 **앞으로** 나아가므로(afterSequence 0 이 가장 오래된 쪽),
 *   첫 페이지를 뒤집어 "최신순"이라고 부르면 아직 읽지도 않은 최신 이벤트가 더 읽기
 *   뒤에 숨는다. 시간순 그대로 쌓고 더 읽기는 뒤에 이어 붙인다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { listFamilyBookingEvents } from "@/shared/api";
import type { BookingAuditEvent } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

/** 계약 최대 200. 이력 모달은 한 번에 크게 읽고 더 읽기 횟수를 줄인다. */
const EVENT_PAGE_LIMIT = 100;

export interface BookingEventsState {
  /** 계약 그대로 sequence 오름차순 — 과거가 위, 최신이 아래다. */
  events: BookingAuditEvent[];
  /** 첫 페이지를 읽는 중. */
  loading: boolean;
  /** 더 읽기가 진행 중. */
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

interface EventsSnapshot {
  key: string;
  events: BookingAuditEvent[];
  nextAfterSequence: string | null;
  hasMore: boolean;
  error: string | null;
}

export function useBookingEvents(familyBookingId: string | null): BookingEventsState {
  const [snapshot, setSnapshot] = useState<EventsSnapshot | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const requestKey = `${familyBookingId ?? ""}:${reloadToken}`;

  /** 더 읽기 요청 — 모달이 닫히거나 다시 읽을 때 취소한다. */
  const moreController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (familyBookingId === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const page = await listFamilyBookingEvents(
          familyBookingId,
          { limit: EVENT_PAGE_LIMIT },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSnapshot({
          key: requestKey,
          events: page.items,
          nextAfterSequence: page.page.nextAfterSequence,
          hasMore: page.page.hasMore,
          error: null,
        });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setSnapshot({
          key: requestKey,
          events: [],
          nextAfterSequence: null,
          hasMore: false,
          error: defaultErrorMessage(caught),
        });
      }
    })();

    return () => {
      controller.abort();
      // 첫 페이지가 갈아엎히면 진행 중이던 더 읽기는 낡은 커서를 좇는 셈이다.
      moreController.current?.abort();
      moreController.current = null;
      setLoadingMore(false);
    };
  }, [familyBookingId, requestKey]);

  const fresh = snapshot !== null && snapshot.key === requestKey;

  const loadMore = useCallback(() => {
    if (familyBookingId === null) return;
    if (snapshot === null || snapshot.key !== requestKey) return;
    if (!snapshot.hasMore || snapshot.nextAfterSequence === null) return;
    if (moreController.current !== null) return;

    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);

    const cursor = snapshot.nextAfterSequence;

    void (async () => {
      try {
        const page = await listFamilyBookingEvents(
          familyBookingId,
          { afterSequence: cursor, limit: EVENT_PAGE_LIMIT },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSnapshot((previous) => {
          // 이어 붙이는 동안 다른 예약으로 갈아탔다면 이 응답은 남의 것이다.
          if (previous === null || previous.key !== requestKey) return previous;
          return {
            ...previous,
            events: [...previous.events, ...page.items],
            nextAfterSequence: page.page.nextAfterSequence,
            hasMore: page.page.hasMore,
            error: null,
          };
        });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 이미 읽은 이력은 남긴다 — 더 읽기 실패가 보고 있던 것을 지우면 안 된다.
        setSnapshot((previous) =>
          previous === null || previous.key !== requestKey
            ? previous
            : { ...previous, error: defaultErrorMessage(caught) },
        );
      } finally {
        if (moreController.current === controller) moreController.current = null;
        if (!controller.signal.aborted) setLoadingMore(false);
      }
    })();
  }, [familyBookingId, requestKey, snapshot]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    events: fresh ? snapshot.events : [],
    loading: familyBookingId !== null && !fresh,
    loadingMore,
    error: fresh ? snapshot.error : null,
    hasMore: fresh && snapshot.hasMore,
    loadMore,
    reload,
  };
}
