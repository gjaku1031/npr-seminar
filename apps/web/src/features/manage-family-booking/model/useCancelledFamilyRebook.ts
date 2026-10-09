"use client";

/**
 * 취소된 재원생 가족 예약을 다시 예약할 때, 함께 담아야 할 재원생 전부를 취소된 집계에서
 * 끌어옴 — 명단에 안 보이는 형제까지
 *
 * 왜 여기서 한 번만 부르는가: 명단 행은 지금 페이지에서 보이는 형제만 암. 취소된 가족의 형제는
 * 다른 페이지에 있을 수 있고, 일부만 다시 예약하면 나머지는 나중에 `ACTIVE_FAMILY_BOOKING_EXISTS`
 * 로 막힘. 그렇다고 명단을 그릴 때 행마다 미리 부르면 곧 N+1 임 — 그래서 재예약 대화상자를
 * 열 때(클릭 한 번)만 그 취소된 집계 1건을 부름. 대화상자가 닫히면 요청을 취소함
 *
 * fail-closed: 집계를 못 읽거나(네트워크·권한) 취소 상태가 아니거나 링크가 어긋나면(GUEST·studentId
 * 없음) `studentIds` 를 null 로 두고 이유를 담음 — 호출부는 그때 예약 버튼을 막음
 *
 * loading 은 상태로 쓰지 않고 파생함(useBookingEvents 와 같은 결). effect 안에서 동기
 *   setState 를 하지 않으려는 것임 — 그건 렌더 연쇄를 부름
 *
 * 응답은 전체 연락처를 담은 ADMIN 전용 민감 데이터임 — studentId 목록만 뽑고 그 외에는 붙잡지
 *   않음. 저장·로깅 금지
 */

import { useEffect, useState } from "react";
import { cancelledFamilyRebookStudentIds, getAdminFamilyBooking } from "@/shared/api";
import { defaultErrorMessage, isAborted } from "@/shared/api";

/**
 * 취소된 가족 재예약 대상 계산 상태
 */
export interface CancelledFamilyRebookState {
  /**
   * 불러오는 중 여부
   */
  loading: boolean;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;
  /**
   * 취소된 가족의 재원생 studentId 전부(선택한 행이 맨 앞, 중복 제거). 준비 전·실패면 null
   */
  studentIds: string[] | null;
}

/**
 * 요청 키별 재예약 대상 계산 결과
 */
interface RebookSnapshot {
  /**
   * 가족 예약·선택 학생 조합 키
   */
  key: string;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 학생 ID 목록
   */
  studentIds: string[] | null;
}

/**
 * 취소된 가족 예약을 읽어 재예약할 학생 ID 목록을 계산
 */
export function useCancelledFamilyRebook(
  familyBookingId: string | null,
  primaryStudentId: string | null,
): CancelledFamilyRebookState {
  const [snapshot, setSnapshot] = useState<RebookSnapshot | null>(null);

  // 재예약 대상이 아니면(신규 예약이거나 대상 학생이 없으면) 부를 것이 없음 — 키가 null 임
  const requestKey =
    familyBookingId !== null && primaryStudentId !== null ? `${familyBookingId}:${primaryStudentId}` : null;

  useEffect(() => {
    if (familyBookingId === null || primaryStudentId === null || requestKey === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const detail = await getAdminFamilyBooking(familyBookingId, controller.signal);
        if (controller.signal.aborted) return;
        const resolved = cancelledFamilyRebookStudentIds(detail, primaryStudentId);
        setSnapshot({
          key: requestKey,
          error: resolved.ok ? null : resolved.reason,
          studentIds: resolved.ok ? resolved.studentIds : null,
        });
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        setSnapshot({ key: requestKey, error: defaultErrorMessage(caught), studentIds: null });
      }
    })();

    return () => controller.abort();
  }, [familyBookingId, primaryStudentId, requestKey]);

  // 지금 키의 응답만 신선함 — 대상이 바뀌면 낡은 스냅샷을 그리지 않고 다시 loading 임
  const fresh = snapshot !== null && snapshot.key === requestKey;

  return {
    loading: requestKey !== null && !fresh,
    error: fresh ? snapshot.error : null,
    studentIds: fresh ? snapshot.studentIds : null,
  };
}
