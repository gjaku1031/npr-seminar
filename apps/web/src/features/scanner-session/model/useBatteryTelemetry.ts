"use client";

/**
 * 배터리 텔레메트리 — 계약 ScannerHeartbeatRequest 의 nullable 필드용.
 *
 * Battery Status API 는 iOS Safari 에 없다(= iPad 현장 기기에서 대개 미지원).
 * 계약이 요구하는 대로 미지원이면 `null` 을 보내고 화면에는 `확인 불가` 로 표시한다.
 * 숫자를 추정하거나 마지막 값을 이어 붙이지 않는다.
 */

import { useEffect, useState } from "react";

/** Battery Status API — 표준 lib.dom 에 없어서 최소 형태만 선언한다. */
interface BatteryManager extends EventTarget {
  /** 0..1 */
  level: number;
  charging: boolean;
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManager>;
};

export interface BatteryTelemetry {
  /** 0..100 정수, 미지원이면 null. */
  batteryLevelPercent: number | null;
  isCharging: boolean | null;
  supported: boolean;
}

const UNSUPPORTED: BatteryTelemetry = {
  batteryLevelPercent: null,
  isCharging: null,
  supported: false,
};

function readBattery(battery: BatteryManager): BatteryTelemetry {
  return {
    // level 은 0..1 실수 — 계약은 0..100 정수를 요구한다.
    batteryLevelPercent: Math.round(battery.level * 100),
    isCharging: battery.charging,
    supported: true,
  };
}

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
        // 권한 정책 등으로 거부되면 미지원과 동일하게 취급한다.
      });

    return () => {
      cancelled = true;
      battery?.removeEventListener("levelchange", sync);
      battery?.removeEventListener("chargingchange", sync);
    };
  }, []);

  return telemetry;
}
