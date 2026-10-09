"use client";

/**
 * QR 체크인 — 계약 POST /api/v1/scanner/check-ins/qr
 *
 * - 같은 토큰 2.5초 쿨다운 + 처리 중 재진입 차단
 * - 서버 검증만 신뢰함
 *
 * 멱등성: 키를 QR 토큰별로 잡음. 결과 미상(네트워크·5xx) 후 같은 QR 을 다시 스캔하면
 * 같은 키가 나가 서버가 리플레이로 처리함 — 매번 새 키를 만들면 같은 가족이 두 번
 * 체크인될 수 있음. 다른 토큰은 별개 조작임
 *
 * 원문 QR 토큰은 요청 본문으로만 나가고 저장·로깅하지 않음. 키 맵도 메모리 전용이며
 * 상한이 있어 장시간 스캔에서 무한히 자라지 않음
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkInFamilyByQr,
  checkInFamilyManually,
  defaultErrorMessage,
  isAborted,
  useKeyedOperationKeys,
  type CheckInOutcome,
} from "@/shared/api";
import { extractQrToken } from "@/shared/lib/qrToken";

/**
 * 같은 QR 재처리 대기 시간. 연속 디코드돼도 2.5초 안에는 한 번만 처리함
 */
const DUPLICATE_COOLDOWN_MS = 2500;

/**
 * 인원을 되물은 뒤 무엇으로 다시 보낼지
 *
 * 두 입장 경로는 서버에게 자기를 다르게 밝힘 — QR 은 원문 토큰으로, 수동 입장은 예약
 * id 로. 인원 선택 화면은 두 경로가 함께 쓰므로, 화면이 아니라 이 값이 확정 요청의
 * 목적지를 정함. 확정이 QR 전용이면 수동 입장에서는 인원 선택 화면이 뜨지 않음
 */
export type CheckInSource =
  | { readonly kind: "QR"; readonly token: string }
  | { readonly kind: "MANUAL"; readonly familyBookingId: string };

/**
 * 멱등 키를 잡는 단위. 경로가 달라도 같은 예약이면 같은 키를 쓰면 안 됨 — 서로 다른
 * 본문의 요청이기 때문임
 */
function sourceKey(source: CheckInSource): string {
  return source.kind === "QR" ? source.token : `manual:${source.familyBookingId}`;
}

/**
 * 체크인 결과 패널 상태
 */
export type CheckInPanel =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "outcome"; outcome: CheckInOutcome }
  | { kind: "error"; message: string }
  /**
   * 2명 예약이 스캔됐고 아직 입장이 아님. QR·회차·예약 검증은 이미 끝났고, 실제로 몇 분이
   * 왔는지만 남았음. 스태프가 고를 때까지 서버는 예약을 건드리지 않음
   *
   * `confirming` 은 선택 후 확정 요청이 나가는 중 — 두 선택지를 모두 잠가 이중 확정을 막음
   */
  | { kind: "party"; source: CheckInSource; outcome: CheckInOutcome; confirming: boolean }
  /**
   * 결과 미상 건이 상한만큼 쌓여 새 QR 을 보낼 수 없음
   * 이미 스캔한 QR 의 재시도는 계속 가능함 (기존 키를 그대로 씀)
   */
  | { kind: "backlog" };

/**
 * QR 체크인 상태와 동작
 */
export interface QrCheckInState {
  /**
   * 결과 패널 상태
   */
  panel: CheckInPanel;

  /**
   * 디코드한 QR 문자열 처리
   */
  handleScan: (decodedText: string) => void;
  /**
   * 다른 경로(수동 입장)가 받아 온 결과를 이 화면 흐름에 넘김
   *
   * `source` 를 함께 받는 이유: 결과가 "인원을 물어라"이면 여기서 선택 화면을 열어야 하고,
   * 그때 확정 요청이 어디로 가야 하는지는 결과만 봐서는 알 수 없음
   */
  showOutcome: (outcome: CheckInOutcome, source: CheckInSource) => void;
  /**
   * 입장이 확정될 때마다 늘어남. 수동 입장 후보 목록이 이 값을 보고 다시 읽어,
   * 인원 선택을 거친 예약도 목록에서 제 상태로 보이게 함
   */
  settledCount: number;
  /**
   * 인원을 확정해 입장시킴. 새 Idempotency-Key 로 나감 — 본문이 달라진 요청임
   */
  confirmParty: (attendedCount: number) => void;
  /**
   * 인원을 고르지 않고 물러남. 예약은 그대로 미입장임
   */
  cancelParty: () => void;

  /**
   * 패널 초기화
   */
  reset: () => void;
}

/**
 * QR 체크인 훅. 같은 토큰 쿨다운·토큰별 멱등 키 유지
 */
export function useQrCheckIn(enabled: boolean): QrCheckInState {
  const [panel, setPanel] = useState<CheckInPanel>({ kind: "idle" });
  const [settledCount, setSettledCount] = useState(0);
  const lastTokenRef = useRef("");
  const processingRef = useRef(false);
  // 인원 선택이 열려 있는 동안 새 스캔을 막는 문. state 로 두면 콜백이 낡은 값을 봄
  const partyOpenRef = useRef(false);
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
      // 쿨다운 중이거나 이미 처리 중이면 무시함
      if (!token || token === lastTokenRef.current || processingRef.current) return;
      // 인원 선택이 떠 있는 동안은 카메라가 무엇을 읽든 무시함 — 스태프가 답하기 전에
      // 다음 QR 이 화면을 밀어내면 그 가족은 입장 처리가 되지 않은 채 넘어감
      if (partyOpenRef.current) return;

      // 이 토큰의 키 — 결과 미상 뒤 재스캔하면 같은 키가 다시 나가 서버가 리플레이함
      // mutation 을 보내기 전에 확보함: 상한에 걸리면 아예 보내지 않아야 함
      const lookup = checkInKeys.keyFor(token);

      if (!lookup.ok) {
        // 미확정 건이 가득 찼음 — 새 QR 은 처리하지 않음
        // 쿨다운은 걸어 둠: 카메라가 초당 수십 번 재디코드해도 패널이 요동치지 않게
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
          // 확정 결과 — 키를 놓아줌. PARTY_SELECTION_REQUIRED 도 확정 응답임(서버가
          // 아무것도 바꾸지 않았음). 놓아줘야 확정 요청이 새 키를 받음
          checkInKeys.settle(token);
          if (outcome.result === "PARTY_SELECTION_REQUIRED") {
            partyOpenRef.current = true;
            setPanel({ kind: "party", source: { kind: "QR", token }, outcome, confirming: false });
            return;
          }
          if (outcome.result === "CHECKED_IN") setSettledCount((count) => count + 1);
          setPanel({ kind: "outcome", outcome });
        } catch (caught) {
          // 확정 4xx 면 키를 버리고, network·5xx·abort 면 유지함(같은 토큰 재스캔이 리플레이되도록)
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

  const showOutcome = useCallback((outcome: CheckInOutcome, source: CheckInSource) => {
    // 되묻는 응답은 아직 입장이 아님 — 결과처럼 3초 뒤 사라지게 두면 그 가족은 처리되지
    // 않은 채 넘어감. QR 경로와 같은 선택 화면으로 보냄
    if (outcome.result === "PARTY_SELECTION_REQUIRED") {
      partyOpenRef.current = true;
      setPanel({ kind: "party", source, outcome, confirming: false });
      return;
    }
    if (outcome.result === "CHECKED_IN") setSettledCount((current) => current + 1);
    setPanel({ kind: "outcome", outcome });
  }, []);

  // 고른 인원으로 입장을 확정함
  // 첫 스캔과 다른 본문이 나가므로 반드시 새 키여야 함 — 앞에서 settle 로 놓아줬기에
  // `keyFor` 가 새 키를 만들어 줌. 같은 키로 보내면 서버가 키 재사용으로 거절함
  const confirmParty = useCallback(
    (attendedCount: number) => {
      setPanel((current) => {
        if (current.kind !== "party" || current.confirming) return current;
        const { source } = current;
        const key = sourceKey(source);
        const lookup = checkInKeys.keyFor(key);
        if (!lookup.ok) return { kind: "backlog" };
        // 다시 시도할 방법이 경로마다 다르므로 안내 문구도 갈라 줌
        const retryHint = source.kind === "QR" ? "같은 QR을 다시 스캔해 주세요." : "같은 예약을 다시 눌러 주세요.";

        void (async () => {
          try {
            const outcome = source.kind === "QR"
              ? await checkInFamilyByQr(source.token, { idempotencyKey: lookup.key }, attendedCount)
              : await checkInFamilyManually(source.familyBookingId, { idempotencyKey: lookup.key }, attendedCount);
            checkInKeys.settle(key);
            partyOpenRef.current = false;
            if (outcome.result === "CHECKED_IN") setSettledCount((count) => count + 1);
            setPanel({ kind: "outcome", outcome });
          } catch (caught) {
            checkInKeys.settle(key, caught);
            if (isAborted(caught)) return;
            partyOpenRef.current = false;
            setPanel({
              kind: "error",
              message: `${defaultErrorMessage(caught)} ${retryHint}`,
            });
          }
        })();

        return { ...current, confirming: true };
      });
    },
    [checkInKeys],
  );

  // 고르지 않고 물러남 — 예약은 미입장 그대로임. 같은 QR 을 다시 찍으면 이어서 할 수 있음
  const cancelParty = useCallback(() => {
    partyOpenRef.current = false;
    lastTokenRef.current = "";
    setPanel({ kind: "idle" });
  }, []);

  // 화면 상태만 되돌림
  // 미확정 키 맵은 일부러 건드리지 않음: 서버 결과가 확정되지 않은 조작은 UI 를
  // 리셋한다고 사라지지 않음. 여기서 맵을 비우면 같은 QR 을 다시 스캔할 때 새 키가 나가
  // 이중 체크인이 됨. 키는 오직 확정 결과(`settle`)로만 사라짐
  const reset = useCallback(() => {
    partyOpenRef.current = false;
    lastTokenRef.current = "";
    setPanel({ kind: "idle" });
  }, []);

  return { panel, handleScan, showOutcome, settledCount, confirmParty, cancelParty, reset };
}
