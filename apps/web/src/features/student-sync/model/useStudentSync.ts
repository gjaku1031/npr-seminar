"use client";

/**
 * 학생 원천 동기화 상태 + 수동 실행 (계약 tag: Admin student sync)
 *
 * 폴링 규칙: 실행이 살아 있는 동안에만 되묻고, 끝나면 멈춤. 유휴 상태에서 계속
 * 두드리면 관리자 한 명이 열어둔 탭이 6시간 내내 API 를 때림
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  evaluateManualSyncGate,
  getStudentSyncStatus,
  startManualStudentSync,
  SYNC_ALREADY_RUNNING_CODE,
  SYNC_BLOCKED_CIRCUIT_OPEN,
  SYNC_CIRCUIT_OPEN_CODE,
} from "@/shared/api";
import { isActiveSyncRun, type StudentSyncStatus } from "@/shared/api";
import { defaultErrorMessage, isAborted, isApiError, useOperationKey } from "@/shared/api";
import { shouldRefreshStudentsAfterSync, type ObservedSyncRun } from "./sync-status-freshness";

/**
 * 실행 중일 때만 도는 폴링 간격
 */
const POLL_INTERVAL_MS = 5_000;
/**
 * 유휴 탭의 저빈도 안전망. 5초 폴링을 6시간 내내 유지하지 않음
 */
const IDLE_REFRESH_INTERVAL_MS = 5 * 60_000;
/**
 * visibilitychange + focus 가 연달아 와도 상태 요청은 한 번만 만듦
 */
const LIFECYCLE_REFRESH_THROTTLE_MS = 1_000;

/**
 * 수동 실행의 감사 사유 — 계약이 3~500자 `reason` 을 필수로 받음
 * 화면에는 버튼 하나뿐이므로(디자인 truth) 조작의 실제 성격을 그대로 문장으로 보냄
 * 값을 지어내는 것이 아니라 "관리자가 이 화면에서 직접 눌렀다"는 사실을 적는 것임
 */
const MANUAL_SYNC_REASON = "관리자 화면에서 수동 동기화를 실행했습니다.";

/**
 * 학생 동기화 상태와 동작
 */
export interface StudentSyncState {
  /**
   * 동기화 상태. 아직 없으면 null
   */
  status: StudentSyncStatus | null;
  /**
   * 첫 로딩 — 이후 폴링/새로고침은 화면을 비우지 않음
   */
  loading: boolean;
  /**
   * 복구 가능한 읽기 오류. 재시도는 `reload()`
   */
  error: string | null;
  /**
   * 수동 요청이 서버로 나가 있는 중
   */
  starting: boolean;
  /**
   * 최신 실행이 아직 끝나지 않았음
   */
  runActive: boolean;
  /**
   * 회로가 열려 원천 로그인이 막혀 있음
   */
  circuitOpen: boolean;
  /**
   * 지금 수동 동기화를 시작할 수 있는가
   */
  canStart: boolean;
  /**
   * 시작할 수 없다면 사람이 읽을 이유. 가능하면 null
   */
  blockedReason: string | null;
  /**
   * 수동 실행 시도의 결과 메시지 (성공/거절)
   */
  notice: string | null;

  /**
   * 안내 문구 지우기
   */
  dismissNotice: () => void;
  /**
   * 살아 있던 실행이 끝날 때마다 증가함 — 명단을 다시 읽는 신호
   */
  settledToken: number;

  /**
   * 수동 동기화 시작
   */
  startSync: () => void;

  /**
   * 다시 불러오기
   */
  reload: () => void;
}

/**
 * 학생 동기화 상태 조회·수동 실행 훅
 */
export function useStudentSync(): StudentSyncState {
  const [status, setStatus] = useState<StudentSyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [settledToken, setSettledToken] = useState(0);

  const operationKey = useOperationKey();
  const runActive = status !== null && status.latestRun !== null && isActiveSyncRun(status.latestRun.status);
  const latestRunIdentity = status?.latestRun === null || status?.latestRun === undefined
    ? null
    : `${status.latestRun.runType}:${status.latestRun.startedAt}`;
  const latestRunStatus = status?.latestRun?.status ?? null;

  // 자체 실행뿐 아니라 다른 탭·스케줄러가 끝낸 새 실행도 명부 갱신 신호로 바꿈
  // `startedAt` 은 서버가 실행마다 새로 기록하는 안정적인 실행 신원임
  const observedRunRef = useRef<ObservedSyncRun | null>(null);
  useEffect(() => {
    const current = latestRunIdentity === null || latestRunStatus === null
      ? null
      : { identity: latestRunIdentity, status: latestRunStatus };
    if (shouldRefreshStudentsAfterSync(observedRunRef.current, current)) {
      setSettledToken((token) => token + 1);
    }
    observedRunRef.current = current;
  }, [latestRunIdentity, latestRunStatus]);

  // 첫 로드 · 명시적 새로고침 — students 쪽 fetch 와 독립이라 둘이 나란히 나감
  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const next = await getStudentSyncStatus(controller.signal);
        if (controller.signal.aborted) return;
        setStatus(next);
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

  // 실행이 살아 있는 동안에만 폴링함 — 끝나면 이 effect 가 정리되며 멈춤
  useEffect(() => {
    if (!runActive) return;

    const controller = new AbortController();
    const timer = setInterval(() => {
      void (async () => {
        try {
          const next = await getStudentSyncStatus(controller.signal);
          if (controller.signal.aborted) return;
          setStatus(next);
          setError(null);
        } catch (caught) {
          // 폴링 실패로 화면을 무너뜨리지 않음 — 다음 주기에 다시 시도함
          if (isAborted(caught) || controller.signal.aborted) return;
        }
      })();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [runActive]);

  // 이 탭 밖에서 수동/예약 동기화가 실행되면 로컬 상태는 active 전이를 보지 못함
  // 화면으로 돌아오거나 네트워크가 복구될 때 즉시 재검증하고, 계속 열린 탭은 5분에
  // 한 번만 확인함. 실행 중에는 위의 5초 폴링이 단일 소유자임
  useEffect(() => {
    if (runActive) return;

    let lastRefreshAt = Date.now();
    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshAt < LIFECYCLE_REFRESH_THROTTLE_MS) return;
      lastRefreshAt = now;
      setReloadToken((token) => token + 1);
    };

    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const idleTimer = window.setInterval(refreshWhenVisible, IDLE_REFRESH_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("online", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(idleTimer);
    };
  }, [runActive]);

  const circuitOpen = status?.circuit.status === "OPEN";
  // 시작 가능 여부·사유는 서버 상태만으로 정해짐 — 순수 게이트가 단일 진실임
  const { canStart, blockedReason } = evaluateManualSyncGate({ status, runActive, starting });

  const startSync = useCallback(() => {
    if (starting) return;

    setStarting(true);
    setNotice(null);

    void (async () => {
      try {
        const run = await startManualStudentSync(MANUAL_SYNC_REASON, {
          idempotencyKey: operationKey.current(),
        });
        operationKey.settle();
        // 202 가 실행 전체를 돌려주므로 상태를 즉시 갈아끼우고, 위 폴링이 이어받음
        setStatus((previous) => (previous === null ? previous : { ...previous, latestRun: run }));
        setNotice("동기화를 시작했어요.");
      } catch (caught) {
        operationKey.settle(caught);
        if (isAborted(caught)) return;

        if (isApiError(caught) && caught.code === SYNC_ALREADY_RUNNING_CODE) {
          setNotice("이미 다른 동기화가 진행 중이에요.");
        } else if (isApiError(caught) && caught.code === SYNC_CIRCUIT_OPEN_CODE) {
          setNotice(SYNC_BLOCKED_CIRCUIT_OPEN);
        } else {
          setNotice(defaultErrorMessage(caught));
        }
        // 거절 사유는 서버 상태가 진실임 — 추측하지 말고 다시 읽음
        setReloadToken((token) => token + 1);
      } finally {
        setStarting(false);
      }
    })();
  }, [operationKey, starting]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken((token) => token + 1);
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    status,
    loading,
    error,
    starting,
    runActive,
    circuitOpen,
    canStart,
    blockedReason,
    notice,
    dismissNotice,
    settledToken,
    startSync,
    reload,
  };
}
