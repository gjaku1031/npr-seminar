"use client";

/**
 * 대상별 수신 인원 — 발송 전에 "누구에게 몇 명 나가는지"를 탭에서 바로 보여 준다.
 *
 * 서버가 **발송이 쓰는 것과 같은 선택 로직**으로 센 값이다(계약 GET /admin/sms/targets/counts).
 * 화면이 예약 상태로 근사하지 않는 이유가 여기 있다 — 취소 대상은 마지막 해제 시각으로 학생을
 * 다시 추리므로, 상태만 세면 실제로 나가는 수와 어긋난다. 발송 직전에 보여 준 숫자와 실제
 * 발송 수가 다르면 그 숫자는 없느니만 못하다.
 *
 * 이 호출은 previewToken 을 만들지 않는다 — 캠퍼스·회차를 바꿀 때마다 부르는 값이라,
 * 조회가 발송 자격을 남기면 안 된다.
 */

import { useCallback, useEffect, useState } from "react";
import { countSmsTargets, defaultErrorMessage, isAborted } from "@/shared/api";
import type { Branch, SmsAudience } from "@/shared/api";

export interface SmsAudienceCountsState {
  /** 대상 → 인원. 아직 모르면 비어 있다 — 모르는 값을 0 으로 그리지 않는다. */
  countOf: (audience: SmsAudience) => number | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useSmsAudienceCounts(
  branch: Branch | null,
  seminarSessionId: string | null,
): SmsAudienceCountsState {
  /**
   * 결과에 그 결과가 **어느 조건의 것인지**를 함께 들고 있는다.
   *
   * 캠퍼스나 회차가 바뀌면 이전 인원은 곧바로 남의 숫자가 된다. effect 안에서 state 를 비우는
   * 대신 키를 대조해 파생하면, 새 응답이 오기 전까지 자동으로 "모름"이 된다 — 옛 숫자가 잠깐
   * 다른 캠퍼스의 값인 척하는 창이 아예 없다.
   */
  const key = branch === null || seminarSessionId === null ? null : `${branch}:${seminarSessionId}`;
  const [result, setResult] = useState<{ key: string; counts: Partial<Record<SmsAudience, number>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (branch === null || seminarSessionId === null) return;

    const controller = new AbortController();

    void (async () => {
      try {
        const counted = await countSmsTargets({ branch, seminarSessionId }, controller.signal);
        if (controller.signal.aborted) return;
        setResult({
          key: `${branch}:${seminarSessionId}`,
          counts: Object.fromEntries(counted.counts.map((row) => [row.audience, row.recipientCount])),
        });
        setError(null);
      } catch (caught) {
        if (isAborted(caught) || controller.signal.aborted) return;
        // 인원을 모를 때는 지어내지 않는다 — 틀린 숫자보다 없는 편이 낫다.
        setResult(null);
        setError(defaultErrorMessage(caught));
      }
    })();

    return () => controller.abort();
  }, [branch, seminarSessionId, reloadToken]);

  const countOf = useCallback(
    (audience: SmsAudience) => (result !== null && result.key === key ? result.counts[audience] ?? null : null),
    [result, key],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /**
   * 로딩은 상태가 아니라 **파생**이다: 조건이 있는데 그 조건의 결과가 아직 없고 실패도 아니면
   * 읽는 중이다. 별도 플래그를 두면 조건이 바뀌는 순간 잠깐 어긋나고, effect 안에서 그것을
   * 맞추려다 보면 렌더 중 상태 변경으로 이어진다.
   */
  const loading = key !== null && error === null && (result === null || result.key !== key);

  return { countOf, loading, error, reload };
}
