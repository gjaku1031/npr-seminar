"use client";

/**
 * 배터리 텔레메트리 — 계약 ScannerHeartbeatRequest 의 nullable 필드용
 *
 * Battery Status API 는 iOS Safari 에 없음(= iPad 현장 기기에서 대개 미지원)
 * 계약이 요구하는 대로 미지원이면 `null` 을 보내고 화면에는 `확인 불가` 로 표시함
 * 숫자를 추정하거나 마지막 값을 이어 붙이지 않음
 */

import { useEffect, useState } from "react";

/**
 * Battery Status API — 표준 lib.dom 에 없어서 최소 형태만 선언함
 */
interface BatteryManager extends EventTarget {
  /**
   * 0..1
   */
  level: number;

  /**
   * 충전 중 여부
   */
  charging: boolean;
}

/**
 * Battery Status API 가 있는 navigator
 */
type NavigatorWithBattery = Navigator & {
  /**
   * 배터리 정보 조회. 미지원 브라우저에는 없음
   */
  getBattery?: () => Promise<BatteryManager>;
};

/**
 * heartbeat 로 보고할 배터리 정보
 */
export interface BatteryTelemetry {
  /**
   * 0..100 정수, 미지원이면 null
   */
  batteryLevelPercent: number | null;

  /**
   * 충전 중 여부. 모르면 null
   */
  isCharging: boolean | null;

  /**
   * Battery Status API 지원 여부
   */
  supported: boolean;
}

/**
 * 미지원 브라우저의 배터리 정보
 */
const UNSUPPORTED: BatteryTelemetry = {
  batteryLevelPercent: null,
  isCharging: null,
  supported: false,
};

/**
 * BatteryManager 값을 보고용 정보로 변환
 */
function readBattery(battery: BatteryManager): BatteryTelemetry {
  return {
    // level 은 0..1 실수 — 계약은 0..100 정수를 요구함
    batteryLevelPercent: Math.round(battery.level * 100),
    isCharging: battery.charging,
    supported: true,
  };
}

/**
 * 배터리 정보를 구독하는 훅. 미지원이면 null 값
 */
export function useBatteryTelemetry(): BatteryTelemetry {
  const [telemetry, setTelemetry] = useState<BatteryTelemetry>(UNSUPPORTED);

  useEffect(() => {
    const getBattery = (navigator as NavigatorWithBattery).getBattery;
    if (typeof getBattery !== "function") return;

    let battery: BatteryManager | null = null;
    let cancelled = false;

    const sync = () => {
      if (battery && !cancelled) setTelemetry(readBattery(battery));
    };

    void getBattery
      .call(navigator)
      .then((result) => {
        if (cancelled) return;
        battery = result;
        sync();
        battery.addEventListener("levelchange", sync);
        battery.addEventListener("chargingchange", sync);
      })
      .catch(() => {
        // 권한 정책 등으로 거부되면 미지원과 동일하게 취급함
      });

    return () => {
      cancelled = true;
      battery?.removeEventListener("levelchange", sync);
      battery?.removeEventListener("chargingchange", sync);
    };
  }, []);

  return telemetry;
}
