"use client";

/**
 * presence 갱신 — 계약 POST /api/v1/scanner/heartbeat.
 *
 * 계약상 ephemeral(`x-idempotency: exempt`)이라 Idempotency-Key 를 붙이지 않는다:
 * 중복 heartbeat 는 durable 효과가 없다.
 *
 * TODO(contract): 제품 결정에는 배터리 텔레메트리에 `reportedAt` 이 있지만
 * 현재 `packages/contracts/openapi.yaml` 의 `ScannerHeartbeatRequest` 는
 * `clientTime`·`batteryLevelPercent`·`isCharging` 만 정의하고 `additionalProperties: false` 다.
 * 계약이 갱신되기 전에 `reportedAt` 을 보내면 400 이 되므로 보내지 않는다.
 * (관리자 화면의 "마지막 신호" 는 서버가 주는 `ScannerDevice.batteryReportedAt` 을 쓴다.)
 *
 * 실패는 조용히 삼키지 않는다 — 연속 실패는 "재연결 중" 으로 화면에 올린다.
 * 401/403 은 세션이 끊긴 것이므로 상위가 페어링 입력으로 되돌린다.
 */

import { useEffect, useRef, useState } from "react";
import { isAborted, isApiError, sendScannerHeartbeat } from "@/shared/api";
import { useBatteryTelemetry } from "./useBatteryTelemetry";

/** presence TTL 보다 충분히 짧게 — 서버가 온라인으로 유지하도록. */
const HEARTBEAT_INTERVAL_MS = 20_000;
/** 이 횟수 이상 연속 실패하면 사용자에게 재연결 중임을 알린다. */
const RECONNECTING_AFTER_FAILURES = 2;

export interface HeartbeatState {
  /** 연속 실패가 쌓여 재연결 중으로 볼 수 있는가. */
  reconnecting: boolean;
  /** 세션이 무효해졌다 — 새 페어링 코드가 필요하다. */
  sessionLost: boolean;
}

export function useScannerHeartbeat(enabled: boolean): HeartbeatState {
  const battery = useBatteryTelemetry();
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionLost, setSessionLost] = useState(false);
  const failuresRef = useRef(0);

  // 최신 배터리 값을 인터벌 재생성 없이 읽는다 — ref 쓰기는 렌더 밖에서.
  const batteryRef = useRef(battery);
  useEffect(() => {
    batteryRef.current = battery;
  }, [battery]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let cancelled = false;

    const beat = async () => {
      const current = batteryRef.current;

      try {
        await sendScannerHeartbeat(
          {
            clientTime: new Date().toISOString(),
            // 미지원이면 계약대로 null 을 명시한다 — 숫자를 지어내지 않는다.
            batteryLevelPercent: current.batteryLevelPercent,
            isCharging: current.isCharging,
          },
          controller.signal,
        );

        if (cancelled) return;
        failuresRef.current = 0;
        setReconnecting(false);
        // 재페어링 후 첫 성공에서 이전 세션의 상실 상태를 턴다 —
        // 남겨두면 다음 진짜 세션 상실이 상태 변화로 감지되지 않는다.
        setSessionLost(false);
      } catch (error) {
        if (cancelled || isAborted(error)) return;

        // 세션이 죽었으면 재시도해도 소용없다 — 상위가 페어링 화면으로 되돌린다.
        if (isApiError(error) && (error.status === 401 || error.status === 403)) {
          setSessionLost(true);
          return;
        }

        failuresRef.current += 1;
        if (failuresRef.current >= RECONNECTING_AFTER_FAILURES) setReconnecting(true);
      }
    };

    void beat();
    const timer = window.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [enabled]);

  return { reconnecting, sessionLost };
}
