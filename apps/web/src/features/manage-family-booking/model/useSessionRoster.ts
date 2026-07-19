"use client";

/**
 * 회차 예약 명단 데이터 (계약 tag: Admin family bookings).
 *
 * 명단 행은 그 회차에 **예약이 걸린 참가자**다 — 서버가 예약 있는 행만(booked-only)
 * 페이지 이전에 추린다. 예약 없는 재원생은 행으로 오지 않는다. 그래서 화면은 서버가
 * 준 행만 세고, 필터는 전부 서버로 넘긴다: 단위 판정 규칙이 서버에만 있고, 페이지도
 * 서버가 나누므로 한 페이지를 전체인 척할 수 없다.
 *
 * 필터는 URL 에 남긴다(기존 화면들과 같은 방식) — 새로고침·공유·뒤로가기가 그대로 산다.
 * ★ 다만 검색어 말고 **연락처는 URL 에 절대 넣지 않는다**. 명단 응답 자체가 민감 데이터라
 *   저장소에도 캐시하지 않는다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listAdminSessionRoster, parseRosterUnitGroup } from "@/shared/api";
import type { Branch, RosterUnitGroup, SessionRosterPage } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

/** 계약 최대 200. 명단은 한 화면에 길게 보는 편이 낫다. */
export const ROSTER_PAGE_SIZE = 50;

const BRANCHES: ReadonlySet<string> = new Set<Branch>(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]);

function parseBranch(raw: string | null): Branch | undefined {
  return raw !== null && BRANCHES.has(raw) ? (raw as Branch) : undefined;
}

function parsePage(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export interface RosterFilters {
  sessionId: string | undefined;
  branch: Branch | undefined;
  unitGroup: RosterUnitGroup;
  /** 정규 대표 담임 이름. undefined 면 `담임 전체`. */
  teacherName: string | undefined;
  query: string;
  page: number;
}

export interface SessionRosterState {
  page: SessionRosterPage | null;
  loading: boolean;
  /** 이미 그린 표를 남긴 채 새 조건을 읽는 중. */
  refreshing: boolean;
  error: string | null;
  filters: RosterFilters;
  /** 기본 조건이 아닌지 — 빈 표의 문구를 가른다. */
  filtered: boolean;
  setFilters: (next: Partial<RosterFilters>) => void;
  reload: () => void;
}

/**
 * @param sessionFallbackId URL 에 회차가 없을 때 쓸 기본 회차. 회차 목록을 읽기 전에는
 *   undefined 이고, 그동안 명단을 부르지 않는다 — 아무 회차나 긁어 놓고 고른 회차인 척
 *   하지 않기 위해서다.
 */
export function useSessionRoster(sessionFallbackId: string | undefined): SessionRosterState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [result, setResult] = useState<{
    key: string;
    page: SessionRosterPage | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const filters = useMemo<RosterFilters>(
    () => ({
      sessionId: searchParams.get("id") ?? sessionFallbackId,
      branch: parseBranch(searchParams.get("branch")),
      unitGroup: parseRosterUnitGroup(searchParams.get("unit")),
      teacherName: searchParams.get("teacher") ?? undefined,
      query: searchParams.get("q") ?? "",
      page: parsePage(searchParams.get("page")),
    }),
    [searchParams, sessionFallbackId],
  );

  const filtered =
    filters.query.trim() !== "" ||
    filters.branch !== undefined ||
    filters.unitGroup !== "ALL" ||
    filters.teacherName !== undefined;

  const { sessionId, branch, unitGroup, teacherName, query, page: pageNumber } = filters;
  const trimmedQuery = query.trim();
  const requestKey = JSON.stringify([
    sessionId ?? "",
    branch ?? "",
    unitGroup,
    teacherName ?? "",
    trimmedQuery,
    pageNumber,
    reloadToken,
  ]);

  useEffect(() => {
    if (sessionId === undefined) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listAdminSessionRoster(
          sessionId,
          {
            branch,
            unitGroup,
            teacherName,
            query: trimmedQuery === "" ? undefined : trimmedQuery,
            page: pageNumber,
            pageSize: ROSTER_PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, page: next, error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 실패해도 보고 있던 표는 남긴다 — 오류 배너가 명단을 지우지 않는다.
        setResult((previous) => ({
          key: requestKey,
          page: previous?.page ?? null,
          error: defaultErrorMessage(caught),
        }));
      }
    })();

    // 조건이 바뀌면 이전 요청은 버린다 — 늦게 온 낡은 응답이 새 표를 덮지 않는다.
    return () => controller.abort();
  }, [sessionId, branch, unitGroup, teacherName, trimmedQuery, pageNumber, requestKey]);

  const setFilters = useCallback(
    (next: Partial<RosterFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      const write = (key: string, value: string | undefined) => {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      };

      if ("sessionId" in next) write("id", next.sessionId);
      if ("branch" in next) write("branch", next.branch);
      if ("unitGroup" in next) write("unit", next.unitGroup === "ALL" ? undefined : next.unitGroup);
      if ("teacherName" in next) write("teacher", next.teacherName);
      if ("query" in next) write("q", next.query);

      // 필터를 건드리면 페이지는 1로 — 3페이지의 조건이 새 결과에 남아 빈 표를 만들지 않는다.
      if ("page" in next && next.page !== undefined) write("page", String(next.page));
      else params.delete("page");

      const search = params.toString();
      router.replace(search === "" ? pathname : `${pathname}?${search}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    page: result?.page ?? null,
    loading: result === null,
    refreshing: result !== null && result.key !== requestKey,
    error: result?.error ?? null,
    filters,
    filtered,
    setFilters,
    reload,
  };
}
