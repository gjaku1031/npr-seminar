"use client";

/**
 * 관리자 설명회·회차 어댑터 (계약 tag: Admin seminars)
 *
 * 회차만 평평하게 주는 목록 엔드포인트가 계약에 없음. 회차 선택지를 채우려면
 *   설명회 목록을 먼저 읽고, 각 설명회의 회차를 이어서 읽어야 함
 */

import { apiRequest } from "./client";
import type { DurableCallOptions } from "./scanner-admin";
import type {
  AdminSeminarSession,
  AdminSeminarSessionPage,
  SeminarPage,
  SeminarSessionOperationsSummary,
  SeminarSessionStatus,
  SeminarStatus,
} from "./contract";

/**
 * operations-summary 의 서버 원시 필드명(가족 예약 건수). 회차 목록 항목마다 함께 옴
 * 화면·계약 타입은 `activeCount…` 로 쓰므로 어댑터 경계에서 이 이름을 정규화함
 */
interface RawSessionOperationsSummary {
  /**
   * 활성 예약 수. RESERVED + CHECKED_IN
   */
  activeBookingCount: number;

  /**
   * 입장 완료 예약 수
   */
  checkedInBookingCount: number;

  /**
   * 미입장 예약 수
   */
  uncheckedBookingCount: number;

  /**
   * 취소 예약 수
   */
  cancelledBookingCount: number;

  /**
   * 노쇼 예약 수
   */
  noShowBookingCount: number;

  /**
   * 실제 입장 인원
   */
  attendedPeopleCount: number;
}

/**
 * 목록 엔드포인트 원시 회차 — operationsSummary 필드명이 서버 형태(…BookingCount) 그대로임
 */
type RawAdminSeminarSession = Omit<AdminSeminarSession, "operationsSummary"> & {
  /**
   * 운영 요약 원시 값. 단건 응답에는 없을 수 있음
   */
  operationsSummary?: RawSessionOperationsSummary;
};

/**
 * 회차 목록 원시 응답 한 페이지
 */
type RawAdminSeminarSessionPage = Omit<AdminSeminarSessionPage, "items"> & {
  /**
   * 목록
   */
  items: RawAdminSeminarSession[];
};

/**
 * 서버 원시 집계(…BookingCount) → 화면 정규화(…Count). 목록은 항상 집계를 주지만, 없는
 * 경로(방어)라면 0 으로 채움 — active/미체크에 NO_SHOW 를 절대 섞지 않는 규칙은 서버가 지킴
 */
export function normalizeSessionOperationsSummary(
  raw: RawSessionOperationsSummary | undefined,
): SeminarSessionOperationsSummary {
  return {
    activeCount: raw?.activeBookingCount ?? 0,
    checkedInCount: raw?.checkedInBookingCount ?? 0,
    uncheckedCount: raw?.uncheckedBookingCount ?? 0,
    cancelledCount: raw?.cancelledBookingCount ?? 0,
    noShowCount: raw?.noShowBookingCount ?? 0,
    attendedPeopleCount: raw?.attendedPeopleCount ?? 0,
  };
}

/**
 * 원시 회차 → 화면 회차. operationsSummary 만 정규화하고 나머지는 그대로 옮김
 */
export function normalizeAdminSeminarSession(raw: RawAdminSeminarSession): AdminSeminarSession {
  const { operationsSummary, ...rest } = raw;
  return { ...rest, operationsSummary: normalizeSessionOperationsSummary(operationsSummary) };
}

/**
 * 계약 SeminarSessionUpdateRequest (PATCH /admin/seminar-sessions/{id})
 * minProperties:2 — expectedVersion 외 최소 한 필드가 필요함. 여기서는 guestBookingEnabled 만 보냄
 */
export interface SeminarSessionUpdateRequest {
  /**
   * 비재원생 예약 허용 여부
   */
  guestBookingEnabled?: boolean;
  /**
   * 회차 상태 — 화면에서는 '설명회 종료'가 CLOSED 로 내림
   */
  status?: SeminarSessionStatus;

  /**
   * 현재 버전. 다르면 409
   */
  expectedVersion: number;
}

/**
 * 회차 보관(계약 DELETE) — 실제로 지우지 않고 ARCHIVED 로 내림
 *
 * 예약·입장·문자 기록이 매달린 회차를 진짜로 지우면 그 기록들이 갈 곳을 잃음. 그래서
 * 계약의 DELETE 는 처음부터 보관이고, 보관된 회차는 목록에서 빠짐
 */
export async function archiveAdminSeminarSession(
  sessionId: string,
  body: { expectedVersion: number; reason: string },
  options: DurableCallOptions,
): Promise<void> {
  await apiRequest<unknown>(
    `/admin/seminar-sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE", body, idempotencyKey: options.idempotencyKey, signal: options.signal },
  );
}

/**
 * 회차 부분 변경. 낙관적 동시성(expectedVersion)과 멱등 키를 지킴
 *
 * 응답 단건에는 operationsSummary 가 없을 수 있어 0 으로 채움. 실집계가 필요하면 목록을 다시 읽음
 */
export async function updateAdminSeminarSession(
  sessionId: string,
  body: SeminarSessionUpdateRequest,
  options: DurableCallOptions,
): Promise<AdminSeminarSession> {
  const raw = await apiRequest<RawAdminSeminarSession>(
    `/admin/seminar-sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      body,
      idempotencyKey: options.idempotencyKey,
      signal: options.signal,
    },
  );
  return normalizeAdminSeminarSession(raw);
}

/**
 * 설명회 목록 조회 조건
 */
export interface ListSeminarsParams {
  /**
   * 상태
   */
  status?: SeminarStatus;

  /**
   * 페이지 번호
   */
  page?: number;

  /**
   * 페이지 크기
   */
  pageSize?: number;
}

/**
 * 설명회 목록 한 페이지 조회
 */
async function listAdminSeminars(
  params: ListSeminarsParams = {},
  signal?: AbortSignal,
): Promise<SeminarPage> {
  return apiRequest<SeminarPage>("/admin/seminars", {
    method: "GET",
    query: { status: params.status, page: params.page, pageSize: params.pageSize },
    signal,
  });
}

/**
 * 회차 목록 조회 조건
 */
export interface ListSeminarSessionsParams {
  /**
   * 페이지 번호
   */
  page?: number;
  /**
   * 계약 최대 200
   */
  pageSize?: number;
}

/**
 * 한 설명회의 회차 한 페이지 — 계약대로 page/pageSize 를 보냄. 각 항목의 operationsSummary 를
 * 서버 원시 필드명에서 화면 이름으로 정규화해 돌려줌
 */
async function listSeminarSessions(
  seminarId: string,
  params: ListSeminarSessionsParams = {},
  signal?: AbortSignal,
): Promise<AdminSeminarSessionPage> {
  const raw = await apiRequest<RawAdminSeminarSessionPage>(
    `/admin/seminars/${encodeURIComponent(seminarId)}/sessions`,
    { method: "GET", query: { page: params.page, pageSize: params.pageSize }, signal },
  );
  return { ...raw, items: raw.items.map(normalizeAdminSeminarSession) };
}

/**
 * 한 설명회의 회차 전체 — `page.totalPages` 를 끝까지 따라감
 */
async function listAllSeminarSessions(
  seminarId: string,
  signal?: AbortSignal,
): Promise<AdminSeminarSession[]> {
  const first = await listSeminarSessions(seminarId, { page: 1, pageSize: SEMINAR_PAGE_SIZE }, signal);
  if (first.page.totalPages <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: first.page.totalPages - 1 }, (_, index) =>
      listSeminarSessions(seminarId, { page: index + 2, pageSize: SEMINAR_PAGE_SIZE }, signal),
    ),
  );

  return [first, ...rest].flatMap((page) => page.items);
}

/**
 * 회차 선택지. 회차와 소속 설명회 제목
 */
export interface SeminarSessionOption {
  /**
   * 회차
   */
  session: AdminSeminarSession;

  /**
   * 설명회 제목
   */
  seminarTitle: string;
}

/**
 * 계약 PageSize 최대 200
 */
const SEMINAR_PAGE_SIZE = 200;

/**
 * 게시된 설명회 전체 — `page.totalPages` 를 끝까지 따라감
 *
 * 첫 페이지만 읽고 "전체 설명회"라고 부르면 201번째부터가 조용히 사라짐. 실제로 그만큼
 * 많을 일은 없지만, 완전하다고 말하는 쪽이 페이지를 세는 것보다 싸지도 않음
 */
async function listAllPublishedSeminars(signal?: AbortSignal): Promise<SeminarPage["items"]> {
  const first = await listAdminSeminars({ status: "PUBLISHED", pageSize: SEMINAR_PAGE_SIZE }, signal);
  if (first.page.totalPages <= 1) return first.items;

  const rest = await Promise.all(
    Array.from({ length: first.page.totalPages - 1 }, (_, index) =>
      listAdminSeminars({ status: "PUBLISHED", page: index + 2, pageSize: SEMINAR_PAGE_SIZE }, signal),
    ),
  );

  return [first, ...rest].flatMap((page) => page.items);
}

/**
 * 콘솔이 고를 수 있는 회차 — 게시된 설명회의 회차를 모아 시작 시각 순으로 줌
 *
 * 설명회별 요청은 병렬로 냄. 회차가 없는 설명회는 그냥 빈 배열로 합쳐짐
 */
export async function listBookableSessions(signal?: AbortSignal): Promise<SeminarSessionOption[]> {
  const seminars = await listAllPublishedSeminars(signal);

  const perSeminar = await Promise.all(
    seminars.map(async (seminar) => {
      const sessions = await listAllSeminarSessions(seminar.seminarId, signal);
      return sessions.map((session) => ({ session, seminarTitle: seminar.title }));
    }),
  );

  return perSeminar
    .flat()
    .filter((option) => option.session.status !== "ARCHIVED")
    .sort((a, b) => Date.parse(a.session.startsAt) - Date.parse(b.session.startsAt));
}

