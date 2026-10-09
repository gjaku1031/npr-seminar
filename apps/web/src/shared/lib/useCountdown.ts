"use client";

// 만료 시각까지 남은 시간. 페어링 코드 5분 카운트다운용
// 접근성: 화면은 초 단위로 흐르지만 announcement는 분이 바뀔 때만 값이 달라져 aria-live 낭독이 1분 단위로 묶임
// 남은 초는 현재 시각 상태에서 파생해, 만료 시각이 바뀔 때 effect 안에서 동기 setState 없이 표시가 즉시 따라옴

import { useEffect, useMemo, useState } from "react";

/**
 * 카운트다운 상태
 */
export interface Countdown {
  /**
   * 남은 초. 0 이상
   */
  secondsLeft: number;

  /**
   * 만료 여부
   */
  expired: boolean;

  /**
   * 화면 표시용 `4:32` 형식
   */
  label: string;

  /**
   * 분이 바뀔 때만 달라지는 낭독용 문자열
   */
  announcement: string;
}

/**
 * 만료 시각까지 남은 시간 계산
 *
 * @param expiresAt 만료 시각(ISO 8601). null이거나 해석 불가면 비활성(0초)
 */
export function useCountdown(expiresAt: string | null): Countdown {
  const expiresAtMs = useMemo(() => (expiresAt ? Date.parse(expiresAt) : Number.NaN), [expiresAt]);
  const active = !Number.isNaN(expiresAtMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    const tick = () => setNow(Date.now());

    // 첫 갱신은 다음 프레임에 수행해 effect 본문의 동기 setState를 피함
    // 마운트 후 시간이 흘러 첫 렌더의 now가 오래됐을 수 있음
    const frame = window.requestAnimationFrame(tick);
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [active, expiresAtMs]);

  // 남은 초·표시 문자열·낭독 문구 계산
  return useMemo(() => {
    const secondsLeft = active ? Math.max(0, Math.ceil((expiresAtMs - now) / 1000)) : 0;
    const minutes = Math.floor(secondsLeft / 60);
    const seconds = secondsLeft % 60;
    const expired = secondsLeft <= 0;

    return {
      secondsLeft,
      expired,
      label: `${minutes}:${String(seconds).padStart(2, "0")}`,
      announcement: expired
        ? "연결 코드가 만료됐어요. 새 코드를 발급해 주세요."
        : minutes > 0
          ? `연결 코드가 약 ${minutes}분 남았어요.`
          : "연결 코드가 1분 미만 남았어요.",
    };
  }, [active, expiresAtMs, now]);
}
