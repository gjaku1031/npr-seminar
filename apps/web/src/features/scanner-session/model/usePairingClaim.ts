"use client";

/**
 * iPad 페어링 claim — 계약 POST /api/v1/public/scanner-pairing/claims.
 *
 * 핸드오프 요구: 잘못된 코드 / 이미 사용된 코드 / 만료된 코드 / 네트워크 오류를
 * 서로 다른 문구로 안내한다.
 *
 * 결과 미상(네트워크·5xx) 처리:
 * - claim 은 성공 시 세션을 SCANNER 로 재생성한다. 응답을 잃었어도 이미 성립했을 수 있으므로
 *   실패를 알리기 전에 GET /scanner/current 로 실제 상태를 되묻는다.
 * - paired 면 원문 코드를 버리고 세션을 채택한다.
 * - unpaired 면 **같은 키**로 같은 코드만 재시도한다. 코드를 고치는 건 이전 시도가
 *   확정적으로 미페어링임이 밝혀진 뒤에만 새 조작이 된다.
 *
 * 보안: 원문 코드는 이 훅의 state 에만 있고 성공 후 즉시 비운다.
 * 세션은 HttpOnly 쿠키라 클라이언트가 토큰을 들고 있지 않는다.
 */

import { useCallback, useState } from "react";
import {
  claimScannerPairingCode,
  defaultErrorMessage,
  describeClientPlatform,
  isApiError,
  isDefinitiveFailure,
  isValidPairingCode,
  normalizePairingCode,
  reconcileScannerClaim,
  useOperationKey,
  type ScannerCurrent,
  type ScannerDevice,
} from "@/shared/api";

export interface PairingClaimState {
  code: string;
  setCode: (value: string) => void;
  claiming: boolean;
  error: string | null;
  /** 결과 미상 구간 — 코드 편집을 막고 같은 코드 재시도만 허용한다. */
  codeLocked: boolean;
  submit: () => Promise<void>;
}

export interface UsePairingClaimOptions {
  /** 이 iPad 를 부르는 이름 — 계약 deviceName(1~100자). */
  deviceName: string;
  onPaired: (device: ScannerDevice) => void;
  /** 미상 복구 중 이미 페어링돼 있었음을 확인한 경우. */
  onReconciled: (current: ScannerCurrent) => void;
}

/** 계약 status 별 한국어 문구. 서버 detail 은 영어라 그대로 쓰지 않는다. */
function claimErrorMessage(error: unknown): string {
  if (!isApiError(error)) return defaultErrorMessage(error);

  switch (error.status) {
    case 400:
      return "코드 형식이 올바르지 않아요. 6자리를 다시 확인해 주세요.";
    case 403:
      return "이 기기에서는 연결할 수 없어요. 관리자에게 문의해 주세요.";
    case 409:
      return "이미 사용된 코드예요. 관리자에게 새 코드를 요청해 주세요.";
    case 410:
      return "만료된 코드예요. 코드는 5분간만 쓸 수 있어요. 새 코드를 요청해 주세요.";
    case 429:
      return "시도가 너무 잦아요. 잠시 후 다시 입력해 주세요.";
    default:
      return defaultErrorMessage(error);
  }
}

export function usePairingClaim({
  deviceName,
  onPaired,
  onReconciled,
}: UsePairingClaimOptions): PairingClaimState {
  const [code, setCodeState] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeLocked, setCodeLocked] = useState(false);
  const claimKey = useOperationKey();

  const setCode = useCallback(
    (value: string) => {
      // 미상 구간에서는 코드를 못 바꾼다 — 페이로드가 바뀌면 같은 키를 쓸 수 없다.
      if (codeLocked) return;

      setCodeState(normalizePairingCode(value));
      setError(null);
      // 코드를 고쳐 넣는 건 새 조작 — 이전 시도의 키를 물려주지 않는다.
      claimKey.reset();
    },
    [codeLocked, claimKey],
  );

  const submit = useCallback(async () => {
    const normalized = normalizePairingCode(code);

    if (!isValidPairingCode(normalized)) {
      setError("6자리 코드를 정확히 입력해 주세요. 숫자 0·1과 알파벳 I·O는 쓰이지 않아요.");
      return;
    }

    setClaiming(true);
    setError(null);

    try {
      const response = await claimScannerPairingCode(
        {
          pairingCode: normalized,
          deviceName: deviceName.trim() || "현장 스캐너",
          clientPlatform: describeClientPlatform(),
        },
        { idempotencyKey: claimKey.current() },
      );

      claimKey.settle();
      // 성공하면 원문 코드를 즉시 버린다 — 1회용이라 다시 쓸 수 없다.
      setCodeState("");
      setCodeLocked(false);
      onPaired(response.device);
    } catch (caught) {
      if (isDefinitiveFailure(caught)) {
        // 서버가 확정적으로 거절했다 — 코드를 고쳐 다시 시도할 수 있다.
        claimKey.settle(caught);
        setCodeLocked(false);
        setError(claimErrorMessage(caught));
        return;
      }

      // 결과 미상 — 세션이 이미 SCANNER 로 재생성됐을 수 있다.
      const reconciliation = await reconcileScannerClaim();

      if (reconciliation.kind === "paired") {
        // 실제로는 성공했다. 원문 코드를 버리고 세션을 채택한다.
        claimKey.settle();
        setCodeState("");
        setCodeLocked(false);
        onReconciled(reconciliation.current);
        return;
      }

      if (reconciliation.kind === "unpaired") {
        // 확정적으로 페어링되지 않았다 — 같은 키로 같은 코드를 다시 보내면 되고,
        // 코드를 고쳐 새 조작으로 가는 것도 허용한다.
        claimKey.settle(caught);
        setCodeLocked(false);
        setError(`${defaultErrorMessage(caught)} 연결되지 않았어요. 다시 시도해 주세요.`);
        return;
      }

      // 확인조차 실패 — 같은 키·같은 코드만 재시도한다.
      claimKey.settle(caught);
      setCodeLocked(true);
      setError(
        "연결 결과를 확인하지 못했어요. 코드를 바꾸지 말고 같은 코드로 다시 시도해 주세요.",
      );
    } finally {
      setClaiming(false);
    }
  }, [code, deviceName, claimKey, onPaired, onReconciled]);

  return { code, setCode, claiming, error, codeLocked, submit };
}
