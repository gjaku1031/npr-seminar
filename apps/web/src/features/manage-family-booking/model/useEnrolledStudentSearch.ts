"use client";

/**
 * 재원생 수동 예약의 **학생 검색·형제 조회** 데이터 (계약 tag: Admin students).
 *
 * 두 갈래를 둔다:
 *  1. `useEnrolledStudentSearch` — 이름·학교·학번·연락처 뒤 4자리로 활성 재원생을 디바운스 검색.
 *     회차를 함께 보내 각 행의 그 회차 예약 상태를 얹는다(이미 예약된 학생은 화면이 비활성화).
 *  2. `useSameContactSiblings` — 대표 연락처를 고르면 그 번호 뒤 4자리로 형제 후보를 불러
 *     클라이언트에서 **전체 번호 완전 일치**로 좁힌다.
 *
 * ★ `listAdminStudents` 는 배럴이 아니라 어댑터에서 **직접** 가져온다(지시).
 * ★ 응답은 전체 연락처를 담은 ADMIN 전용 민감 데이터다 — 저장·로깅·URL 노출 금지. 그래서
 *   effect 키에도 전체 번호를 넣지 않고 **뒤 4자리**만 넣는다(서버 조회 축과 같다). 완전 일치
 *   필터는 매 렌더 현재 연락처로 파생해, 낡은 스냅샷이 다른 번호를 형제로 착각하지 않게 한다.
 */

import { useEffect, useState } from "react";
import { listAdminStudents } from "@/shared/api/admin-students";
import type { Branch } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";
import {
  contactLast4,
  exactContactSiblingCandidates,
  normalizeEnrolledCandidate,
  type EnrolledStudentCandidate,
} from "./enrolledStudentSearch";

/** 검색 결과 상한 — 대표 1명을 고르는 자리라 한 화면 분량이면 충분하다. 넘치면 더 좁히게 안내한다. */
const SEARCH_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;
/** 형제 후보는 같은 연락처 뒤 4자리라 몇 명 안 되지만, 동명 4자리 충돌을 넉넉히 담아 걸러낸다. */
const SIBLING_PAGE_SIZE = 50;

export interface EnrolledSearchState {
  candidates: EnrolledStudentCandidate[];
  loading: boolean;
  error: string | null;
  /** 결과가 상한에 걸려 더 있을 수 있는지 — "더 좁혀 주세요" 안내용. */
  hasMore: boolean;
  /** 서버가 센 조건 총원. */
  totalItems: number;
}

export function useEnrolledStudentSearch(params: {
  sessionId: string | undefined;
  branch: Branch | undefined;
  term: string;
}): EnrolledSearchState {
  const { sessionId, branch, term } = params;
  const trimmed = term.trim();
  const [debounced, setDebounced] = useState(trimmed);

  // 입력을 디바운스한다 — 타이핑마다 서버를 때리지 않는다(타임아웃 콜백 안 setState 라 렌더 중 아님).
  useEffect(() => {
    const id = setTimeout(() => setDebounced(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [trimmed]);

  const [snapshot, setSnapshot] = useState<{
    key: string;
    candidates: EnrolledStudentCandidate[];
    error: string | null;
    hasMore: boolean;
    totalItems: number;
  } | null>(null);

  const requestKey =
    sessionId === undefined ? null : JSON.stringify([sessionId, branch ?? "", debounced]);

  useEffect(() => {
    if (sessionId === undefined || requestKey === null) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const page = await listAdminStudents(
          {
            query: debounced === "" ? undefined : debounced,
            branch,
            sourceActive: true,
            seminarSessionId: sessionId,
            page: 1,
            pageSize: SEARCH_PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSnapshot({
          key: requestKey,
          candidates: page.items.map(normalizeEnrolledCandidate),
          error: null,
          hasMore: page.page.totalPages > 1,
          totalItems: page.page.totalItems,
        });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setSnapshot({ key: requestKey, candidates: [], error: defaultErrorMessage(caught), hasMore: false, totalItems: 0 });
      }
    })();

    return () => controller.abort();
  }, [sessionId, branch, debounced, requestKey]);

  const fresh = snapshot !== null && snapshot.key === requestKey;
  return {
    candidates: fresh ? snapshot.candidates : [],
    loading: sessionId !== undefined && !fresh,
    error: fresh ? snapshot.error : null,
    hasMore: fresh ? snapshot.hasMore : false,
    totalItems: fresh ? snapshot.totalItems : 0,
  };
}

export interface ContactSiblingsState {
  siblings: EnrolledStudentCandidate[];
  loading: boolean;
  error: string | null;
}

/**
 * 대표 연락처(전체 번호)를 고르면 그 번호를 쓰는 형제 후보를 불러온다.
 *
 * 서버 조회는 **뒤 4자리**로만 좁힌다(민감값을 URL·키에 넣지 않으려는 것). 그래서 effect 키도
 * 뒤 4자리까지만 담고, 최종 형제 목록은 매 렌더 현재 `contact` 로 **전체 번호 완전 일치** 필터를
 * 파생한다 — 뒤 4자리만 같은 남의 번호를 형제로 넣지 않는다.
 */
export function useSameContactSiblings(params: {
  sessionId: string | undefined;
  branch: Branch | undefined;
  /** 대표 연락처 전체 번호. null 이면 아직 안 골랐다. */
  contact: string | null;
  primaryStudentId: string | null;
}): ContactSiblingsState {
  const { sessionId, branch, contact, primaryStudentId } = params;
  const last4 = contact === null ? "" : contactLast4(contact);
  const canQuery =
    sessionId !== undefined && contact !== null && primaryStudentId !== null && last4.length === 4;

  const [snapshot, setSnapshot] = useState<{
    key: string;
    candidates: EnrolledStudentCandidate[];
    error: string | null;
  } | null>(null);

  // 키에 전체 번호를 넣지 않는다 — 뒤 4자리 + 대표 + 범위만. 완전 일치는 아래에서 파생한다.
  const requestKey = canQuery ? JSON.stringify([sessionId, branch ?? "", last4, primaryStudentId]) : null;

  useEffect(() => {
    if (!canQuery || requestKey === null || sessionId === undefined) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const page = await listAdminStudents(
          {
            query: last4,
            branch,
            sourceActive: true,
            seminarSessionId: sessionId,
            page: 1,
            pageSize: SIBLING_PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setSnapshot({ key: requestKey, candidates: page.items.map(normalizeEnrolledCandidate), error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setSnapshot({ key: requestKey, candidates: [], error: defaultErrorMessage(caught) });
      }
    })();

    return () => controller.abort();
  }, [canQuery, sessionId, branch, last4, primaryStudentId, requestKey]);

  const fresh = snapshot !== null && snapshot.key === requestKey;
  const siblings =
    fresh && contact !== null && primaryStudentId !== null
      ? exactContactSiblingCandidates(snapshot.candidates, contact, primaryStudentId)
      : [];

  return { siblings, loading: canQuery && !fresh, error: fresh ? snapshot.error : null };
}
