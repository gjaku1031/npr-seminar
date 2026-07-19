"use client";

/**
 * 만료 시각까지 남은 시간 — 페어링 코드 5분 카운트다운용.
 *
 * 접근성(핸드오프): 초마다 낭독하지 않는다. 화면에는 초 단위로 흐르되
 * `announcement` 는 분이 바뀔 때만 값이 달라져 `aria-live="polite"` 낭독이 1분 단위로 묶인다.
 *
 * 남은 초는 "현재 시각" state 에서 파생한다 — 만료 시각이 바뀔 때 effect 안에서
 * 동기 setState 를 하지 않아도 표시가 즉시 따라온다.
 */

import { useEffect, useMemo, useState } from "react";

export interface Countdown {
  /** 남은 초 (0 이상). */
  secondsLeft: number;
  expired: boolean;
  /** `4:32` 형태의 화면 표시용 문자열. */
  label: string;
  /** 분이 바뀔 때만 값이 변하는 낭독용 문자열. */
  announcement: string;
}

export function useCountdown(expiresAt: string | null): Countdown {
  const expiresAtMs = useMemo(() => (expiresAt ? Date.parse(expiresAt) : Number.NaN), [expiresAt]);
  const active = !Number.isNaN(expiresAtMs);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;

    const tick = () => setNow(Date.now());

    // 첫 갱신은 다음 프레임에 — effect 본문에서 동기로 setState 하지 않는다.
    // (마운트 후 시간이 흘렀을 수 있어 첫 렌더의 `now` 는 오래됐을 수 있다.)
    const frame = window.requestAnimationFrame(tick);
    const timer = window.setInterval(tick, 1000);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [active, expiresAtMs]);

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
