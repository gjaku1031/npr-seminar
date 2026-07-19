"use client";

/**
 * 관리자 학생 명부 조회 (계약 GET /api/v1/admin/students).
 *
 * 필터 상태는 URL 쿼리가 소유한다 — 새로고침·뒤로가기·링크 공유가 같은 화면을 낸다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { listAdminStudents } from "@/shared/api";
import type { AdminStudentReservationPage, Branch, RosterUnitGroup } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export const STUDENT_PAGE_SIZE = 10;

const BRANCHES: ReadonlySet<string> = new Set<Branch>(["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"]);

function parseBranch(raw: string | null): Branch | undefined {
  return raw !== null && BRANCHES.has(raw) ? (raw as Branch) : undefined;
}

/**
 * 단위 그룹 칩이 URL 로 쓰는 값. 명부 화면에는 비재원생(GUEST) 칩이 없으므로 받지 않는다 —
 * 계약 밖 값이나 GUEST 는 전체로 되돌린다.
 */
const UNIT_GROUPS: ReadonlySet<string> = new Set<RosterUnitGroup>([
  "ALL",
  "ELEMENTARY",
  "MIDDLE_1",
  "MIDDLE_2",
  "MIDDLE_3",
  "SPECIAL_PURPOSE",
  "HIGH",
  "SCIENCE",
]);

function parseUnitGroup(raw: string | null): RosterUnitGroup {
  return raw !== null && UNIT_GROUPS.has(raw) ? (raw as RosterUnitGroup) : "ALL";
}

function parsePage(raw: string | null): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

export interface StudentFilters {
  query: string;
  branch: Branch | undefined;
  unitGroup: RosterUnitGroup;
  teacherName: string;
  /**
   * "예약 여부" 열이 기준으로 삼는 회차. URL(`session`)이 소유하되, 아직 고른 적 없으면
   * 호출부가 준 fallback(첫 회차)으로 채운다 — 명단 범위는 바꾸지 않고 각 행의 예약 여부만 정한다.
   */
  seminarSessionId: string | undefined;
  page: number;
}

export interface AdminStudentsState {
  page: AdminStudentReservationPage | null;
  /** 첫 로딩에만 skeleton 을 띄운다 — 필터 전환은 이전 결과를 남겨 둔다. */
  loading: boolean;
  /** 필터·페이지 전환으로 다시 읽는 중. */
  refreshing: boolean;
  error: string | null;
  filters: StudentFilters;
  /** 필터가 하나라도 걸려 있는가 — "결과 없음" 문구를 가르는 기준. */
  filtered: boolean;
  setFilters: (next: Partial<StudentFilters>) => void;
  reload: () => void;
}

export function useAdminStudents(fallbackSessionId?: string): AdminStudentsState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * 한 번의 조회 결과를 통째로 들고 있는다 (요청 신원 `key` 포함).
   *
   * 이렇게 두면 "다시 읽는 중"을 **파생**할 수 있다 — 지금 그려야 할 요청(`requestKey`)과
   * 마지막으로 도착한 결과의 key 가 다르면 그게 곧 refreshing 이다. 효과 본문에서
   * setState 를 때려 렌더를 한 번 더 돌릴 필요가 없다.
   */
  const [result, setResult] = useState<{
    key: string;
    page: AdminStudentReservationPage | null;
    error: string | null;
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const filters = useMemo<StudentFilters>(
    () => ({
      query: searchParams.get("q") ?? "",
      branch: parseBranch(searchParams.get("branch")),
      unitGroup: parseUnitGroup(searchParams.get("unit")),
      teacherName: searchParams.get("teacher") ?? "",
      // URL 이 회차를 지목하지 않았으면 fallback(첫 회차)을 쓰되 URL 은 더럽히지 않는다.
      seminarSessionId: searchParams.get("session") ?? fallbackSessionId,
      page: parsePage(searchParams.get("page")),
    }),
    [searchParams, fallbackSessionId],
  );

  const filtered =
    filters.query.trim() !== "" ||
    filters.branch !== undefined ||
    filters.unitGroup !== "ALL" ||
    filters.teacherName !== "";

  // useMemo 로 만든 filters 객체를 deps 에 그대로 넣으면 참조가 매번 바뀌므로 값으로 푼다.
  const { query, branch, unitGroup, teacherName, seminarSessionId, page: pageNumber } = filters;

  /** 지금 화면이 요구하는 조회의 신원. 이게 바뀌면 곧 새 요청이다. */
  const requestKey = JSON.stringify([
    query.trim(),
    branch ?? "",
    unitGroup,
    teacherName,
    seminarSessionId ?? "",
    pageNumber,
    reloadToken,
  ]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await listAdminStudents(
          {
            query: query.trim() === "" ? undefined : query.trim(),
            branch,
            unitGroup: unitGroup === "ALL" ? undefined : unitGroup,
            teacherName: teacherName === "" ? undefined : teacherName,
            // 학생 현황은 재원 명부 화면이다 — 사용자 필터와 무관하게 항상 재원(active)만 본다.
            sourceActive: true,
            // 회차를 함께 보내면 서버가 각 행에 예약 여부만 얹는다(명단 범위는 그대로).
            seminarSessionId,
            page: pageNumber,
            pageSize: STUDENT_PAGE_SIZE,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setResult({ key: requestKey, page: next, error: null });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 이전 결과는 남겨 둔다 — 화면을 비우는 대신 오류 줄만 얹고 재시도를 권한다.
        setResult((previous) => ({
          key: requestKey,
          page: previous?.page ?? null,
          error: defaultErrorMessage(caught),
        }));
      }
    })();

    return () => controller.abort();
  }, [query, branch, unitGroup, teacherName, seminarSessionId, pageNumber, requestKey]);

  const loading = result === null;
  const refreshing = result !== null && result.key !== requestKey;

  const setFilters = useCallback(
    (next: Partial<StudentFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      const write = (key: string, value: string | undefined) => {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      };

      if ("query" in next) write("q", next.query);
      if ("branch" in next) write("branch", next.branch);
      // ALL 은 기본값이므로 URL 에 남기지 않는다.
      if ("unitGroup" in next) write("unit", next.unitGroup === "ALL" ? undefined : next.unitGroup);
      if ("teacherName" in next) write("teacher", next.teacherName);
      if ("seminarSessionId" in next) write("session", next.seminarSessionId);

      // 명단 **범위**를 바꾸는 필터가 바뀌면 현재 페이지 번호는 의미를 잃는다 — 1로 돌린다.
      // 회차(session)만 바꾸면 같은 명단에 예약 여부만 다시 얹으므로 페이지를 그대로 둔다.
      const changesMembership =
        "query" in next || "branch" in next || "unitGroup" in next || "teacherName" in next;
      if ("page" in next && next.page !== undefined) write("page", String(next.page));
      else if (changesMembership) params.delete("page");

      const search = params.toString();
      router.replace(search === "" ? pathname : `${pathname}?${search}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return {
    page: result?.page ?? null,
    loading,
    refreshing,
    error: result?.error ?? null,
    filters,
    filtered,
    setFilters,
    reload,
  };
}
