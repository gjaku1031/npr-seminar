"use client";

/**
 * 예약 명단 데이터 (계약 tags: Admin family bookings / Admin seminars).
 *
 * 읽기 단위는 **가족 예약 집계**다 — 연락처 1건 + 회차 1건에 자녀가 여러 명 붙는다.
 * 화면이 학생별 행처럼 보이더라도 버전·취소·변경은 전부 가족 단위다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listAdminFamilyBookings, listBookableSessions } from "@/shared/api";
import type { Branch, FamilyBookingPage, FamilyBookingStatus, SeminarSessionOption } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export const BOOKING_PAGE_SIZE = 50;

const BRANCHES: ReadonlySet<string> = new Set<Branch>(["SONGPA", "WIRYE", "GWANGJIN"]);
const STATUSES: ReadonlySet<string> = new Set<FamilyBookingStatus>([
  "RESERVED",
  "CHECKED_IN",
  "CANCELLED",
  "NO_SHOW",
]);

function parseBranch(raw: string | null): Branch | undefined {
  return raw !== null && BRANCHES.has(raw) ? (raw as Branch) : undefined;
}

function parseStatus(raw: string | null): FamilyBookingStatus | undefined {
  return raw !== null && STATUSES.has(raw) ? (raw as FamilyBookingStatus) : undefined;
}

function parsePage(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

/* ── 회차 선택지 ────────────────────────────────────────────────────────── */

export interface SessionOptionsState {
  options: SeminarSessionOption[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useBookableSessions(): SessionOptionsState {
  const [options, setOptions] = useState<SeminarSessionOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listBookableSessions(controller.signal);
        if (controller.signal.aborted) return;
        setOptions(next);
        setError(null);
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setError(defaultErrorMessage(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { options, loading, error, reload };
}

/* ── 예약 목록 ─────────────────────────────────────────────────────────── */

export interface BookingFilters {
  sessionId: string | undefined;
  branch: Branch | undefined;
  status: FamilyBookingStatus | undefined;
  query: string;
  page: number;
}

export interface FamilyBookingsState {
  page: FamilyBookingPage | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  filters: BookingFilters;
  filtered: boolean;
  setFilters: (next: Partial<BookingFilters>) => void;
  reload: () => void;
}

/**
 * @param sessionFallbackId 회차가 URL 에 없을 때 쓸 기본 회차. 회차 목록을 읽기 전에는
 *   undefined 이며, 그동안에는 예약을 부르지 않는다 — 전 회차를 긁어 놓고 한 회차인 척
 *   하지 않기 위해서다.
 */
export function useFamilyBookings(sessionFallbackId: string | undefined): FamilyBookingsState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [result, setResult] = useState<{
    key: string;
    page: FamilyBookingPage | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const filters = useMemo<BookingFilters>(
    () => ({
      sessionId: searchParams.get("id") ?? sessionFallbackId,
      branch: parseBranch(searchParams.get("branch")),
      status: parseStatus(searchParams.get("status")),
      query: searchParams.get("q") ?? "",
      page: parsePage(searchParams.get("page")),
    }),
    [searchParams, sessionFallbackId],
  );

  const filtered =
    filters.query.trim() !== "" || filters.branch !== undefined || filters.status !== undefined;

  const { sessionId, branch, status, query, page: pageNumber } = filters;
  const requestKey = JSON.stringify([sessionId ?? "", branch ?? "", status ?? "", query.trim(), pageNumber, reloadToken]);

  useEffect(() => {
    if (sessionId === undefined) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listAdminFamilyBookings(
          {
            sessionId,
            branch,
            status,
            query: query.trim() === "" ? undefined : query.trim(),
            page: pageNumber,
            pageSize: BOOKING_PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, page: next, error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setResult((previous) => ({
          key: requestKey,
          page: previous?.page ?? null,
          error: defaultErrorMessage(caught),
        }));
      }
    })();

    return () => controller.abort();
  }, [sessionId, branch, status, query, pageNumber, requestKey]);

  const setFilters = useCallback(
    (next: Partial<BookingFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      const write = (key: string, value: string | undefined) => {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      };

      if ("sessionId" in next) write("id", next.sessionId);
      if ("branch" in next) write("branch", next.branch);
      if ("status" in next) write("status", next.status);
      if ("query" in next) write("q", next.query);

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
