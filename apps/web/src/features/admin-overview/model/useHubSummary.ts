"use client";

/**
 * 허브 요약 — 계약이 주는 것만 센다.
 *
 * ★ 단위에 주의한다. 회차의 `capacity` 원장은 **좌석 수**다(참석 학부모가 두 명이면 한
 *   가족이 2석을 쓴다). 허브가 말하는 "예약 N건"은 **가족 예약 건수**이므로 좌석 원장을
 *   더해서 쓰면 단위가 어긋난다. 그래서 건수는 예약 목록의 `page.totalItems` 로만 센다 —
 *   pageSize=1 이라 행은 한 줄만 오지만 그 수는 필터 전체 기준이다.
 *
 * ★ 계약에 콘솔 전역 집계 엔드포인트가 없다. 여기 건수는 회차를 가리지 않은 **전체 가족
 *   예약** 기준이고, 위의 회차 칩 목록(게시된 설명회)과는 범위가 다르다. 화면도 그렇게
 *   말해야 한다.
 */

import { useCallback, useEffect, useState } from "react";
import { countAdminFamilyBookings, countAdminStudents, listAllScannerDevices, listBookableSessions } from "@/shared/api";
import type { SeminarSessionOption } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

export interface HubSummary {
  /** 게시된 설명회의 회차 — 칩 목록용. 아래 건수의 범위가 아니다. */
  sessions: SeminarSessionOption[];
  /** 원천 동기화된 재원생 수 (서버가 센 값). */
  studentCount: number;
  /** 취소를 뺀 가족 예약 **건수** (전 회차). 좌석 수가 아니다. */
  activeBookingCount: number;
  /** 입장 완료한 가족 예약 **건수** (전 회차). */
  checkedInBookingCount: number;
  /** 지금 온라인인 스캐너 대수 — 서버의 presence 판정만 믿는다. */
  devicesOnline: number;
}

export interface HubSummaryState {
  summary: HubSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useHubSummary(): HubSummaryState {
  const [summary, setSummary] = useState<HubSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const [sessions, studentCount, devices, reserved, checkedIn, noShow] = await Promise.all([
          listBookableSessions(controller.signal),
          countAdminStudents({ sourceActive: true }, controller.signal),
          listAllScannerDevices({ status: "ACTIVE" }, controller.signal),
          countAdminFamilyBookings({ status: "RESERVED" }, controller.signal),
          countAdminFamilyBookings({ status: "CHECKED_IN" }, controller.signal),
          countAdminFamilyBookings({ status: "NO_SHOW" }, controller.signal),
        ]);
        if (controller.signal.aborted) return;

        setSummary({
          sessions,
          studentCount,
          // 노쇼도 예약은 한 것이다 — 취소만 뺀다.
          activeBookingCount: reserved + checkedIn + noShow,
          checkedInBookingCount: checkedIn,
          devicesOnline: devices.filter((device) => device.online).length,
        });
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

  return { summary, loading, error, reload };
}
