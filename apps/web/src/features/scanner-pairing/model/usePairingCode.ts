"use client";

/**
 * 페어링 코드 발급/취소 상태.
 *
 * 보안 불변식:
 * - 원문 6자리 코드는 **이 훅의 메모리에만** 존재한다. 웹 스토리지/URL/로그에 절대 쓰지 않고,
 *   취소 시작·만료·연결 완료 시 즉시 버린다. 계약상 코드는 신규 발급 응답에서 한 번만 내려온다.
 *
 * 활성 코드 불변식 (동시에 두 개의 유효한 코드를 만들지 않는다):
 * - 활성 코드를 들고 있는 동안 발급은 막힌다 (`canIssue` 는 idle/expired 에서만 참).
 * - 취소가 409(이미 claim) 로 끝나면 새 코드를 만들지 않고 연결된 기기 상태로 안내한다.
 * - 발급 결과가 미상이면(`unknown-create`) 서버에 코드가 생겼을 수 있다. 이때는
 *   폼 편집도, 새 키·새 페이로드도 막고 **원래 페이로드를 같은 키로만** 재시도한다.
 *   그래야 서버가 리플레이로 응답해 PairingCodeMetadata 를 되찾을 수 있다.
 *   끝내 못 찾으면 첫 시도 기준 5분 TTL 이 지날 때까지 발급을 막았다가 expired 로 푼다.
 *
 * 멱등성:
 * - 발급·취소 각각 조작 단위 키를 소유한다. 확정 성공/확정 4xx 에서만 키를 버리고,
 *   네트워크 실패·5xx 재시도는 같은 키를 다시 보내 중복 durable 변경을 막는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelOutcomeMessage,
  cancelScannerPairingCode,
  createScannerPairingCode,
  defaultErrorMessage,
  isApiError,
  isDefinitiveFailure,
  isFreshPairingCode,
  useOperationKey,
  type Branch,
  type PairingCodeCreateResult,
  type PairingCodeMetadata,
} from "@/shared/api";

interface PairingInput {
  branch: Branch;
  gateCode: string;
  intendedDeviceName: string;
}

/** 계약 PairingCodeMetadata.ttlSeconds 는 상수 300. */
const PAIRING_TTL_MS = 300_000;

/**
 * 계약상 "같은 키 + 다른 요청" 은 409 다. 사용자가 발급 대상을 바꿨다면 그건 새 조작이므로
 * 이전 시도의 키를 물려주면 안 된다. 단, 결과 미상 구간에서는 애초에 편집을 막는다.
 */
function sameInput(a: PairingInput | null, b: PairingInput): boolean {
  return (
    a !== null &&
    a.branch === b.branch &&
    a.gateCode.trim() === b.gateCode.trim() &&
    a.intendedDeviceName.trim() === b.intendedDeviceName.trim()
  );
}

function normalizeInput(input: PairingInput): PairingInput {
  return {
    branch: input.branch,
    gateCode: input.gateCode.trim(),
    intendedDeviceName: input.intendedDeviceName.trim(),
  };
}

export type PairingCodeStatus =
  /** 소유한 코드가 없다 — 발급 가능. */
  | "idle"
  /** 발급 요청 중. */
  | "issuing"
  /** 유효한 코드를 소유 중 — 발급 금지, 취소 가능. */
  | "issued"
  /**
   * 발급 결과 미상 — 서버에 활성 코드가 있을 수 있다.
   * 폼 편집·신규 발급 금지. 같은 페이로드/같은 키 재시도만 허용.
   */
  | "unknown-create"
  /** 취소 요청 중(원문은 이미 버림) — 결과 미상이면 여기 머문다. 발급 금지. */
  | "cancelling"
  /** 5분 TTL 경과로 서버에서도 무효 — 발급 가능. */
  | "expired";

export interface PairingCodeState {
  status: PairingCodeStatus;
  /** 발급 직후에만 존재하는 원문 코드. 취소 시작·만료·연결 즉시 null. */
  code: string | null;
  pairing: PairingCodeMetadata | null;
  notice: string | null;
  error: string | null;
  /** 활성 코드를 소유하지 않은 상태에서만 참. */
  canIssue: boolean;
  /** 결과 미상 구간 — 폼을 잠가 페이로드가 바뀌지 못하게 한다. */
  formLocked: boolean;
  /** 카운트다운·만료 판정의 단일 기준 (발급된 코드의 expiresAt 또는 미상 구간의 TTL 마감). */
  deadlineIso: string | null;
  issue: (input: PairingInput) => Promise<void>;
  /** `unknown-create` 에서 원래 페이로드를 같은 키로 재시도한다. */
  retryUnknown: () => Promise<void>;
  cancel: () => Promise<void>;
  expire: () => void;
  markClaimed: (deviceName: string) => void;
}

export interface UsePairingCodeOptions {
  /** 코드가 claim 됐음이 밝혀지면 기기 목록을 다시 읽는다. */
  onClaimDetected?: () => void;
}

export function usePairingCode({ onClaimDetected }: UsePairingCodeOptions = {}): PairingCodeState {
  const [status, setStatus] = useState<PairingCodeStatus>("idle");
  const [code, setCode] = useState<string | null>(null);
  const [pairing, setPairing] = useState<PairingCodeMetadata | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 미상 구간의 보수적 마감 — 첫 시도 시각 + 5분. */
  const [unknownDeadlineIso, setUnknownDeadlineIso] = useState<string | null>(null);

  const issueKey = useOperationKey();
  const cancelKey = useOperationKey();
  const abortRef = useRef<AbortController | null>(null);
  /** 미상 재시도가 반드시 되풀이해야 하는 원본 페이로드. */
  const pendingInputRef = useRef<PairingInput | null>(null);
  const lastIssueInputRef = useRef<PairingInput | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const canIssue = status === "idle" || status === "expired";
  const formLocked = status === "issuing" || status === "unknown-create" || status === "cancelling";
  const deadlineIso = pairing?.expiresAt ?? unknownDeadlineIso;

  /** 발급 성공 응답 반영 — 신규는 원문 코드, 리플레이는 메타데이터만. */
  const applyCreateResult = useCallback((result: PairingCodeCreateResult, recovered: boolean) => {
    setPairing(result.pairing);
    setUnknownDeadlineIso(null);
    pendingInputRef.current = null;

    if (isFreshPairingCode(result)) {
      setCode(result.pairingCode);
      setStatus("issued");
      setNotice(null);
      return;
    }

    // 리플레이 — 계약상 원문 코드를 주지 않는다. 없는 코드를 지어내지 않고
    // 메타데이터로 코드가 살아 있음을 알린 뒤 불투명 id 로 취소만 허용한다.
    setCode(null);
    setStatus("issued");
    setNotice(
      recovered
        ? "먼저 보낸 발급 요청이 서버에서 처리돼 있었어요. 코드는 다시 표시할 수 없으니 취소 후 새로 발급해 주세요."
        : "이미 발급된 코드예요. 화면에 다시 표시할 수 없으니 취소 후 새로 발급해 주세요.",
    );
  }, []);

  /** 결과 미상 진입 — 첫 시도 시각 기준으로 TTL 마감을 건다(이미 걸려 있으면 유지). */
  const enterUnknown = useCallback((input: PairingInput, caught: unknown) => {
    pendingInputRef.current = input;
    setCode(null);
    setPairing(null);
    setStatus("unknown-create");
    setUnknownDeadlineIso((current) => current ?? new Date(Date.now() + PAIRING_TTL_MS).toISOString());
    setError(
      `${defaultErrorMessage(caught)} 코드가 발급됐는지 확인되지 않아 새 발급을 막았어요. 같은 내용으로 다시 시도해 주세요.`,
    );
  }, []);

  const runCreate = useCallback(
    async (input: PairingInput, recovering: boolean) => {
      setStatus("issuing");
      setError(null);
      if (!recovering) setNotice(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await createScannerPairingCode(input, {
          idempotencyKey: issueKey.current(),
          signal: controller.signal,
        });

        issueKey.settle();
        applyCreateResult(result, recovering);
      } catch (caught) {
        // 확정 4xx 만 새 조작으로 되돌린다.
        if (isDefinitiveFailure(caught)) {
          issueKey.settle(caught);
          pendingInputRef.current = null;
          setUnknownDeadlineIso(null);
          setCode(null);
          setPairing(null);
          setStatus("idle");
          setError(
            isApiError(caught) && caught.status === 429
              ? "발급 요청이 너무 잦아요. 잠시 후 다시 시도해 주세요."
              : defaultErrorMessage(caught),
          );
          return;
        }

        // network·5xx·abort → 결과 미상. 키를 유지한 채 재시도만 허용한다.
        issueKey.settle(caught);
        enterUnknown(input, caught);
      }
    },
    [issueKey, applyCreateResult, enterUnknown],
  );

  const issue = useCallback<PairingCodeState["issue"]>(
    async (rawInput) => {
      // 활성 코드를 이미 들고 있거나 결과 미상이면 두 번째 코드를 만들지 않는다.
      if (!canIssue) return;

      const input = normalizeInput(rawInput);

      // 발급 대상이 바뀌었으면 새 조작 — 이전 시도의 키를 물려주지 않는다.
      if (!sameInput(lastIssueInputRef.current, input)) issueKey.reset();
      lastIssueInputRef.current = input;

      await runCreate(input, false);
    },
    [canIssue, issueKey, runCreate],
  );

  /** 미상 구간 복구 — 반드시 원본 페이로드 + 원본 키. */
  const retryUnknown = useCallback(async () => {
    const input = pendingInputRef.current;
    if (status !== "unknown-create" || !input) return;
    await runCreate(input, true);
  }, [status, runCreate]);

  const cancel = useCallback(async () => {
    if (!pairing || status === "cancelling") return;

    // 취소를 시작하는 순간 원문 코드를 화면과 메모리에서 함께 버린다.
    setCode(null);
    setStatus("cancelling");
    setError(null);

    try {
      const outcome = await cancelScannerPairingCode(pairing.pairingCodeId, {
        idempotencyKey: cancelKey.current(),
      });

      // 204(취소·재취소)와 404(없음)는 모두 "이 코드는 끝났다".
      // 409(claim)는 경합에서 진 것 — 새 코드를 만들지 않고 연결된 기기를 보여준다.
      setPairing(null);
      setUnknownDeadlineIso(null);
      setStatus("idle");
      setNotice(cancelOutcomeMessage(outcome));
      if (outcome.kind === "already-claimed") onClaimDetected?.();

      cancelKey.settle();
    } catch (caught) {
      cancelKey.settle(caught);

      if (isDefinitiveFailure(caught)) {
        // 401/403 등 — 재시도해도 같은 결과다. 코드가 살아 있을 수 있으니 발급은 계속 막는다.
        setStatus("cancelling");
        setError(defaultErrorMessage(caught));
        return;
      }

      // 결과 미상 — 서버에 코드가 살아 있을 수 있으므로 발급을 열어주지 않는다.
      // 같은 키로 재시도하거나, 5분이 지나면 expired 로 자연히 풀린다.
      setStatus("cancelling");
      setError(`${defaultErrorMessage(caught)} 코드가 아직 유효할 수 있어 취소를 다시 시도해 주세요.`);
    }
  }, [pairing, status, cancelKey, onClaimDetected]);

  const expire = useCallback(() => {
    // TTL 경과 — 서버에서도 무효다(미상으로 만들어졌더라도 마찬가지).
    setCode(null);
    setPairing(null);
    setUnknownDeadlineIso(null);
    pendingInputRef.current = null;
    setStatus("expired");
    setError(null);
    cancelKey.reset();
    issueKey.reset();
  }, [cancelKey, issueKey]);

  const markClaimed = useCallback(
    (deviceName: string) => {
      setCode(null);
      setPairing(null);
      setUnknownDeadlineIso(null);
      pendingInputRef.current = null;
      setStatus("idle");
      setError(null);
      setNotice(`${deviceName} 기기가 연결됐어요.`);
      cancelKey.reset();
      issueKey.reset();
    },
    [cancelKey, issueKey],
  );

  return {
    status,
    code,
    pairing,
    notice,
    error,
    canIssue,
    formLocked,
    deadlineIso,
    issue,
    retryUnknown,
    cancel,
    expire,
    markClaimed,
  };
}
