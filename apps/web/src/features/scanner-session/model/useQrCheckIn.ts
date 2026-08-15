"use client";

/**
 * QR 체크인 — 계약 POST /api/v1/scanner/check-ins/qr.
 *
 * qr-poc `ScannerClient.handleScan` 이식 (pinned c4194a0):
 * - 같은 토큰 2.5초 쿨다운 + 처리 중 재진입 차단.
 * - 서버 검증만 신뢰한다. 원본의 Server Action/DB 접근은 이식하지 않는다.
 *
 * 멱등성: 키를 **QR 토큰별로** 잡는다. 결과 미상(네트워크·5xx) 후 같은 QR 을 다시 스캔하면
 * 같은 키가 나가 서버가 리플레이로 처리한다 — 매번 새 키를 만들면 같은 가족이 두 번
 * 체크인될 수 있다. 다른 토큰은 별개 조작이다.
 *
 * 원문 QR 토큰은 요청 본문으로만 나가고 저장·로깅하지 않는다. 키 맵도 메모리 전용이며
 * 상한이 있어 장시간 스캔에서 무한히 자라지 않는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkInFamilyByQr,
  defaultErrorMessage,
  isAborted,
  useKeyedOperationKeys,
  type CheckInOutcome,
} from "@/shared/api";
import { extractQrToken } from "@/shared/lib/qrToken";

/** qr-poc 검증값 — 같은 QR 이 연속 디코드돼도 2.5초 안에는 한 번만 처리한다. */
const DUPLICATE_COOLDOWN_MS = 2500;

export type CheckInPanel =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "outcome"; outcome: CheckInOutcome }
  | { kind: "error"; message: string }
  /**
   * 결과 미상 건이 상한만큼 쌓여 **새 QR** 을 보낼 수 없다.
   * 이미 스캔한 QR 의 재시도는 계속 가능하다 (기존 키를 그대로 쓴다).
   */
  | { kind: "backlog" };

export interface QrCheckInState {
  panel: CheckInPanel;
  handleScan: (decodedText: string) => void;
  showOutcome: (outcome: CheckInOutcome) => void;
  reset: () => void;
}

export function useQrCheckIn(enabled: boolean): QrCheckInState {
  const [panel, setPanel] = useState<CheckInPanel>({ kind: "idle" });
  const lastTokenRef = useRef("");
  const processingRef = useRef(false);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const checkInKeys = useKeyedOperationKeys();

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const handleScan = useCallback(
    (decodedText: string) => {
      if (!enabled) return;

      const token = extractQrToken(decodedText);
      // 쿨다운 중이거나 이미 처리 중이면 무시한다.
      if (!token || token === lastTokenRef.current || processingRef.current) return;

      /**
       * 이 토큰의 키 — 결과 미상 뒤 재스캔하면 같은 키가 다시 나가 서버가 리플레이한다.
       * mutation 을 보내기 **전에** 확보한다: 상한에 걸리면 아예 보내지 않아야 한다.
       */
      const lookup = checkInKeys.keyFor(token);

      if (!lookup.ok) {
        // 미확정 건이 가득 찼다 — 새 QR 은 처리하지 않는다.
        // 쿨다운은 걸어 둔다: 카메라가 초당 수십 번 재디코드해도 패널이 요동치지 않게.
        lastTokenRef.current = token;
        timersRef.current.push(
          setTimeout(() => {
            if (lastTokenRef.current === token) lastTokenRef.current = "";
          }, DUPLICATE_COOLDOWN_MS),
        );
        setPanel({ kind: "backlog" });
        return;
      }

      lastTokenRef.current = token;
      processingRef.current = true;
      setPanel({ kind: "processing" });

      void (async () => {
        try {
          const outcome = await checkInFamilyByQr(token, { idempotencyKey: lookup.key });
          // 확정 결과 — 키를 놓아준다.
          checkInKeys.settle(token);
          setPanel({ kind: "outcome", outcome });
        } catch (caught) {
          // 확정 4xx 면 키를 버리고, network·5xx·abort 면 유지한다(같은 토큰 재스캔이 리플레이되도록).
          checkInKeys.settle(token, caught);
          if (isAborted(caught)) return;
          setPanel({ kind: "error", message: `${defaultErrorMessage(caught)} 같은 QR을 다시 스캔해 주세요.` });
        } finally {
          processingRef.current = false;
          timersRef.current.push(
            setTimeout(() => {
              if (lastTokenRef.current === token) lastTokenRef.current = "";
            }, DUPLICATE_COOLDOWN_MS),
          );
        }
      })();
    },
    [enabled, checkInKeys],
  );

  const showOutcome = useCallback((outcome: CheckInOutcome) => {
    setPanel({ kind: "outcome", outcome });
  }, []);

  /**
   * 화면 상태만 되돌린다.
   *
   * 미확정 키 맵은 **일부러 건드리지 않는다**: 서버 결과가 확정되지 않은 조작은 UI 를
   * 리셋한다고 사라지지 않는다. 여기서 맵을 비우면 같은 QR 을 다시 스캔할 때 새 키가 나가
   * 이중 체크인이 된다. 키는 오직 확정 결과(`settle`)로만 사라진다.
   */
  const reset = useCallback(() => {
    lastTokenRef.current = "";
    setPanel({ kind: "idle" });
  }, []);

  return { panel, handleScan, showOutcome, reset };
}
