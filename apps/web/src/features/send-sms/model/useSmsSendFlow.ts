"use client";

/**
 * 단체 문자 발송 흐름 훅. 계약 POST targets/preview → POST sends
 *
 * 불변식 — 이 파일이 지키는 전부:
 * 1. 버튼 한 번으로 발송되지 않음. 기본 버튼은 프리뷰만 부름. 실제 발송은
 *    확인 대화상자에서 사용자가 명시적으로 확인했을 때만 나감. 취소는 아무것도 보내지 않음
 * 2. 발송은 프리뷰가 준 그 previewToken 과 함께 나감. 토큰이 없으면 시작조차 하지 않음
 * 3. 한 번의 발송 시도는 하나의 Idempotency-Key 를 씀. 결과 미상(네트워크·5xx)에서
 *    재시도해도 같은 키임 — 새 키를 달면 같은 문자가 두 번 나감
 * 4. 확인 시점의 요청 본문을 얼려서 재시도에 그대로 씀. 같은 키 + 다른 본문은 계약상 409 임
 * 5. 실패는 세 갈래로 갈림 (classifySmsSendFailure):
 *    - 결과 미상 → 확인 화면에 남아 같은 키·같은 토큰으로만 재시도
 *    - 409 SMS_PREVIEW_TOKEN_CHANGED → 큐에 들어간 게 없음. 시도를 확정 종료하고 프리뷰·
 *      얼린 본문을 버린 뒤 확인 화면을 닫음. 같은 토큰 재시도는 반드시 실패하므로 권하지 않음
 *    - 그 밖의 확정 4xx → 같은 내용 재시도는 같은 실패임. 마찬가지로 닫고 고치게 함
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { classifySmsSendFailure, enqueueSmsSend, previewSmsTargets, useOperationKey } from "@/shared/api";
import { defaultErrorMessage, smsContentErrorMessage } from "@/shared/api";
import type { SmsEnqueueAccepted, SmsTargetPreview, SmsTargetRequest } from "@/shared/api";

/**
 * 단체 문자 발송 진행 단계
 */
export type SmsSendPhase =
  /**
   * 아무 요청도 나가 있지 않음
   */
  | "idle"
  /**
   * 프리뷰 왕복 중 — 아직 아무것도 발송되지 않았음
   */
  | "previewing"
  /**
   * 프리뷰를 받아 확인 대화상자가 떠 있음. 여기서 취소하면 발송은 없음
   */
  | "confirming"
  /**
   * 사용자가 확인했고 발송 요청이 나가 있음
   */
  | "sending";

/**
 * 단체 문자 발송 흐름 상태와 동작
 */
export interface SmsSendFlowState {
  /**
   * 진행 단계
   */
  phase: SmsSendPhase;
  /**
   * 서버 프리뷰 — 확인 화면과 폰 미리보기가 이 값만 읽음
   */
  preview: SmsTargetPreview | null;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;
  /**
   * 확인 화면에 남은 실패가 재시도 가능한가
   * `retry-same` 일 때만 같은 키·같은 토큰 재시도를 권함
   */
  retryable: boolean;

  /**
   * 처리 중 여부
   */
  busy: boolean;
  /**
   * 기본 버튼: 프리뷰만 부름
   */
  requestPreview: () => void;
  /**
   * 확인 버튼: 얼려 둔 본문 + 같은 토큰/키로 실제 발송
   */
  /**
   * @param scheduledAt 예약 발송 시각(ISO). 생략하면 즉시 발송
   */
  confirmSend: (scheduledAt?: string) => void;
  /**
   * 취소 — 아무것도 보내지 않고 확인 화면만 닫음
   */
  cancel: () => void;
}

/**
 * 프리뷰 실패 — 아직 아무것도 발송되지 않은 지점이라 그대로 알려 주고 고치게 함
 */
function previewErrorMessage(error: unknown): string {
  return smsContentErrorMessage(error) ?? defaultErrorMessage(error);
}

/**
 * @param request 완성된 발송 요청. 아직 고를 것이 남았으면 null 을 넘김 —
 *   그동안에는 프리뷰조차 부르지 않음
 * @param options.onSent 서버가 202 로 접수를 확인한 뒤에 부름 (이력 새로고침·안내용)
 */
export function useSmsSendFlow(
  request: SmsTargetRequest | null,
  options: { onSent?: (accepted: SmsEnqueueAccepted) => void } = {},
): SmsSendFlowState {
  const [phase, setPhase] = useState<SmsSendPhase>("idle");
  const [preview, setPreview] = useState<SmsTargetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);

  // 확인 시점에 얼린 본문 — 재시도는 이 값만 다시 보냄 (같은 키 + 같은 본문)
  const frozenRef = useRef<SmsTargetRequest | null>(null);
  // 발송 요청이 나가 있는 동안 무효화가 끼어들지 못하게 하는 빗장 (렌더가 아니라 핸들러가 세움)
  const sendingRef = useRef(false);
  // 프리뷰 세대 번호
  // 프리뷰가 도는 중에 본문을 고치면, 먼저 나간 프리뷰의 응답이 나중에 도착해 낡은 대상·
  // 낡은 본문으로 확인창을 열어 버림. 세대가 어긋난 응답은 버림
  const previewSeqRef = useRef(0);
  const sendKey = useOperationKey();

  const { onSent } = options;
  const requestKey = request === null ? null : JSON.stringify(request);

  // 프리뷰·얼린 본문을 버리고 새 확인을 요구하는 상태로 되돌림
  const discardPreview = useCallback(() => {
    previewSeqRef.current += 1;
    setPreview(null);
    frozenRef.current = null;
    setPhase("idle");
  }, []);

  // 페이로드가 의미 있게 바뀌면 프리뷰는 죽고 키도 새로 시작함
  // 발송 요청이 나가 있는 동안에는 손대지 않음 — 미확정 키를 버리면 재시도가 새 키로 나감
  useEffect(() => {
    if (sendingRef.current) return;
    previewSeqRef.current += 1;
    setPreview(null);
    setError(null);
    setRetryable(false);
    setPhase("idle");
    frozenRef.current = null;
    sendKey.reset();
  }, [requestKey, sendKey]);

  const requestPreview = useCallback(() => {
    if (request === null) return;

    previewSeqRef.current += 1;
    const seq = previewSeqRef.current;

    setPhase("previewing");
    setError(null);
    setRetryable(false);

    void (async () => {
      try {
        const next = await previewSmsTargets(request);
        // 그 사이 본문·대상이 바뀌었으면 이 응답은 버림 (낡은 확인창을 열지 않음)
        if (seq !== previewSeqRef.current) return;
        setPreview(next);
        // 새 프리뷰 = 새 발송 시도. 이전 시도의 키를 물려주지 않음
        sendKey.reset();
        frozenRef.current = request;
        setPhase("confirming");
      } catch (caught) {
        if (seq !== previewSeqRef.current) return;
        setError(previewErrorMessage(caught));
        setPhase("idle");
      }
    })();
  }, [request, sendKey]);

  // 예약 발송 시각(ISO) 또는 null(즉시 발송)
  // 프리뷰가 아니라 확인 시점에 읽음. 프리뷰는 "누구에게 무엇을"을 얼리는 것이고,
  //   언제 보낼지는 그 뒤에 정해도 대상이 달라지지 않음
  const confirmSend = useCallback((scheduledAt?: string) => {
    const frozen = frozenRef.current;
    const token = preview?.previewToken;
    // 토큰 없이는 발송하지 않음 — 프리뷰를 건너뛴 발송 경로를 만들지 않기 위해서임
    if (frozen === null || token === undefined) return;

    setPhase("sending");
    setError(null);
    setRetryable(false);
    sendingRef.current = true;

    void (async () => {
      try {
        const accepted = await enqueueSmsSend(frozen, token, {
          idempotencyKey: sendKey.current(),
          ...(scheduledAt === undefined ? {} : { scheduledAt }),
        });
        sendKey.settle();
        sendingRef.current = false;
        // 발송이 끝났으니 이 프리뷰·토큰은 소진됐음 — 다시 보내려면 다시 확인받아야 함
        discardPreview();
        sendKey.reset();
        onSent?.(accepted);
      } catch (caught) {
        sendingRef.current = false;
        const failure = classifySmsSendFailure(caught);
        // 확정 4xx(409 포함)면 키를 버리고, 결과 미상이면 유지해 같은 키로 재시도함
        sendKey.settle(caught);
        setError(failure.message);
        setRetryable(failure.action === "retry-same");

        if (failure.action === "retry-same") {
          // 확인 화면에 그대로 머묾 — 같은 토큰·같은 키로 재시도할 수 있게
          setPhase("confirming");
          return;
        }

        // 409 SMS_PREVIEW_TOKEN_CHANGED 를 포함한 확정 실패 — 큐에 들어간 것이 없음
        // 낡은 확인 화면을 닫고 프리뷰·얼린 본문을 버림. 사용자가 '발송 확인'을 다시 눌러야
        // 새 토큰이 생김. 여기서 같은 토큰 재시도를 남겨 두면 반드시 실패할 버튼을 권하는 셈임
        discardPreview();
        sendKey.reset();
      }
    })();
  }, [preview, sendKey, onSent, discardPreview]);

  const cancel = useCallback(() => {
    // 발송이 이미 나가 있으면 닫지 않음
    // ConfirmDialog 의 Esc 는 busy 와 무관하게 onCancel 을 부름. 그대로 두면 발송이 날아가는
    // 중에 창이 닫혀 "취소됐다"로 읽히는데, 실제로는 문자가 나감. 결과를 볼 때까지 붙잡음
    if (sendingRef.current) return;

    // 아무 요청도 보내지 않음. 프리뷰 결과는 폰 미리보기가 계속 쓰므로 남겨 둠
    setPhase("idle");
    setError(null);
    setRetryable(false);
  }, []);

  return {
    phase,
    preview,
    error,
    retryable,
    busy: phase === "previewing" || phase === "sending",
    requestPreview,
    confirmSend,
    cancel,
  };
}
