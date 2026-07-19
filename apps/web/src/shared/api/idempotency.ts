"use client";

/**
 * durable 변경의 Idempotency-Key 수명 관리.
 *
 * 문제: 어댑터가 호출마다 새 UUID를 만들면, 응답이 유실된 뒤의 재시도가 서버에는
 * **다른 조작**으로 보여 중복 변경(코드 2개 발급, 이중 체크인)이 생긴다.
 *
 * 규칙:
 * - 키는 "사용자가 의도한 조작 1건" 단위로 만들고, 결과가 미상인 동안 계속 재사용한다.
 * - 확정 성공 또는 확정 4xx 에서만 버린다. 네트워크 실패·취소·5xx 는 결과 미상이므로 유지한다.
 * - ref(메모리)에만 둔다 — 웹 스토리지에 쓰지 않는다.
 */

import { useCallback, useMemo, useRef } from "react";
import { isApiError } from "./problem";

/**
 * 모듈 내부 전용 — 밖으로 내보내지 않는다.
 * 조작마다 즉석에서 키를 만드는 것이 바로 중복 durable 변경의 원인이므로,
 * 키 생성은 수명을 관리하는 아래 훅들만 할 수 있게 한다.
 */
function newOperationKey(): string {
  return crypto.randomUUID();
}

/**
 * 서버가 요청을 확정적으로 거절했는가?
 * 4xx 는 재시도해도 같은 결과이므로 키를 놓아준다.
 * network/aborted(status 0)·5xx 는 서버가 이미 처리했을 수 있어 키를 유지해야 한다.
 */
export function isDefinitiveFailure(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500;
}

/**
 * 결과 미상 — 서버가 변경을 이미 적용했을 수도, 아닐 수도 있다(network·abort·5xx).
 * 이 경우 **절대** 새 키로 재시도하면 안 되고, 성공/실패를 단정하기 전에
 * 서버 상태를 되물어야 한다 (`reconcileScanner*`).
 *
 * 별도 함수를 두지 않고 `!isDefinitiveFailure(error)` 로 판정한다 — 두 술어가
 * 엇갈릴 여지를 없앤다.
 */

export interface OperationKeyHandle {
  /** 이번 시도에 쓸 키 — 미확정 재시도는 같은 값을 받는다. */
  current: () => string;
  /** 새 조작을 시작할 때 명시적으로 버린다. */
  reset: () => void;
  /**
   * 시도 결과를 반영한다.
   * `settle()` (인자 없음) = 확정 성공, `settle(error)` = 실패.
   * 확정 실패(4xx)면 버리고, 결과 미상이면 유지한다.
   */
  settle: (error?: unknown) => void;
}

export function useOperationKey(): OperationKeyHandle {
  const keyRef = useRef<string | null>(null);

  const current = useCallback(() => {
    keyRef.current ??= newOperationKey();
    return keyRef.current;
  }, []);

  const reset = useCallback(() => {
    keyRef.current = null;
  }, []);

  const settle = useCallback((error?: unknown) => {
    if (error === undefined || isDefinitiveFailure(error)) keyRef.current = null;
  }, []);

  // 참조 안정성 — 이 핸들을 deps 에 넣는 useCallback 이 매 렌더 재생성되지 않게 한다.
  return useMemo(() => ({ current, reset, settle }), [current, reset, settle]);
}

/**
 * 페이로드별 키 — 같은 대상(QR 토큰·예약 id)에 대한 재시도는 같은 키를 다시 쓰고,
 * 다른 대상은 별개 조작으로 취급한다.
 *
 * 메모리(ref) 전용이다. 키도, 키를 만드는 식별자(QR 토큰)도 저장·로깅하지 않는다.
 *
 * ── 미확정 키는 절대 자동 축출하지 않는다 ─────────────────────────────────────
 * `settle` 이 확정 성공·확정 4xx 에서 항목을 지우므로, 이 맵에 남아 있는 항목은 **전부
 * 결과 미상**이다. 따라서 "가장 오래된 항목 축출"은 곧 미확정 키 폐기이고, 그 대상이
 * 나중에 재시도되면 새 키가 나가 durable 조작이 중복된다(이중 체크인).
 *
 * 대신 상한은 안전 장치로만 둔다: 상한에 닿으면 **새 페이로드에 키를 내주지 않는다**.
 * 호출부는 그때 mutation 을 보내지 않고 사용자에게 미확정 건을 먼저 정리하라고 알린다.
 * 기존 미확정 키 조회는 상한과 무관하게 항상 성공한다.
 */

/** 키 조회 결과 — 실패를 예외가 아니라 타입으로 드러낸다. */
export type OperationKeyLookup =
  | { ok: true; key: string }
  /**
   * 미확정 조작이 상한만큼 쌓여 새 조작을 시작할 수 없다.
   * 기존 미확정 조작을 재시도/정리해 확정시키면 자리가 난다.
   */
  | { ok: false; reason: "capacity" };

export interface KeyedOperationKeys {
  /**
   * 이 식별자에 대한 키.
   * - 이미 미확정 키가 있으면 항상 `{ ok: true }` (상한과 무관하게 재시도 가능).
   * - 새 식별자인데 상한에 닿았으면 `{ ok: false, reason: "capacity" }` — 키를 만들지 않는다.
   */
  keyFor: (id: string) => OperationKeyLookup;
  /** 확정 성공(`settle(id)`) 또는 확정 4xx 에서만 버린다. */
  settle: (id: string, error?: unknown) => void;
  reset: (id: string) => void;
}

/** 안전 상한 — 무한 증가를 막되, 도달 시 축출이 아니라 신규 발급 거부로 동작한다. */
const DEFAULT_MAX_KEYS = 50;

/* ── 의도 고정 키 ───────────────────────────────────────────────────────── */

/**
 * 키를 붙잡아 두는 것만으로는 부족하다 — **무엇에 대한 키인지**도 붙잡아야 한다.
 *
 * 위의 `useKeyedOperationKeys` 는 대상(id)별로 키를 유지한다. 그런데 결과 미상으로 키가
 * 남아 있는 동안 사용자가 *다른 내용*을 보내면(참석을 모→부로 바꿨거나, 변경 대신 취소를
 * 골랐거나) **같은 키에 다른 페이로드**가 나간다. 서버 입장에서 그건 idempotency 불일치이거나,
 * 더 나쁘게는 "첫 요청은 이미 적용됐는데 두 번째 의도가 덮어쓰는" 중복 durable 변경이다.
 *
 * 그래서 여기서는 키와 **불변 의도 페이로드**를 함께 붙잡는다:
 * - 결과 미상이면 그때 보낸 그 페이로드를 키와 함께 그대로 들고 있는다.
 * - 똑같은 의도로 다시 오면 그 키를 재사용한다 (진짜 재시도).
 * - 다른 의도로 오면 **키를 내주지 않는다** — 호출부가 보내지 않고 사용자에게 알린다.
 * - 확정 성공·확정 4xx 면 키와 의도를 함께 놓아준다.
 *
 * ★ 메모리(ref) 전용이다. 의도에는 연락처 원문이 들어 있을 수 있으므로 문자열로 굳혀
 *   저장하거나 로깅하지 않는다 — 구조 비교만 한다.
 */

/**
 * 두 의도가 **정확히 같은가** — 순수 구조 비교다.
 *
 * 의도는 계약 요청 본문이 될 값이므로 JSON 스칼라·배열·평범한 객체만 온다. 그래서 여기서
 * 다루는 것도 그뿐이다 (Date·Map·순환 참조는 계약 본문에 없다).
 *
 * 객체 키 순서는 의미가 없으므로 무시하고, 배열 순서는 의미가 있으므로 지킨다.
 * 값이 `undefined` 인 키는 계약 본문에서 "없는 키"와 같으므로 그렇게 취급한다 —
 * `{ grade: undefined }` 와 `{}` 는 같은 요청이다.
 *
 * `JSON.stringify` 비교가 아닌 이유가 둘 있다: 키 순서만 달라도 같은 의도가 달라 보이고,
 * 연락처가 통째로 담긴 문자열을 만들어 들고 다니게 된다.
 */
export function sameOperationIntent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => sameOperationIntent(item, right[index]));
  }

  const keysOf = (value: object) =>
    Object.keys(value).filter((key) => (value as Record<string, unknown>)[key] !== undefined);
  const leftKeys = keysOf(left);
  const rightKeys = keysOf(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every(
    (key) =>
      Object.hasOwn(right, key) &&
      sameOperationIntent((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

/**
 * 붙잡을 의도를 **호출부 객체와 완전히 분리된 불변 스냅샷**으로 굳힌다.
 *
 * 왜: 호출부가 넘긴 객체는 대화상자 상태와 연결돼 있어 begin 이후에도 편집될 수 있다. 그 참조를
 * 그대로 들고 있으면 첫 전송·재시도가 **지금 화면 값**을 몰래 실어 보내게 된다. 그래서 begin 이
 * 새 의도를 받을 때 이 함수로 재귀 복제 + 재귀 동결한 detached 스냅샷을 만들어 붙잡고, 첫 전송과
 * 재시도 모두 그 스냅샷만 쓴다.
 *
 * 의도는 계약 요청 본문이 될 값이라 JSON 스칼라·배열·평범한 객체만 온다(Date·Map·순환 없음).
 * 그래서 `JSON.stringify` 없이 구조만 복제한다 — 연락처가 통째로 담긴 문자열을 만들지 않는다.
 * `undefined` 값은 그대로 옮긴다(계약 본문에서 "없는 키"이고, 비교는 그렇게 취급한다).
 */
export function detachOperationIntent<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const copy = value.map((item) => detachOperationIntent(item));
    return Object.freeze(copy) as unknown as T;
  }

  const source = value as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    copy[key] = detachOperationIntent(source[key]);
  }
  return Object.freeze(copy) as unknown as T;
}

/** 의도까지 맞춰 본 키 조회 결과. */
export type OperationIntentLookup<I> =
  | {
      ok: true;
      key: string;
      /**
       * 붙잡힌 **불변 스냅샷**. 첫 전송과 재시도는 호출부의 (편집될 수 있는) 객체가 아니라 이
       * 값으로만 나가야 한다 — 보내는 것과 붙잡는 것이 갈라지지 않게 한다.
       */
      intent: I;
    }
  | { ok: false; reason: "capacity" }
  /**
   * 이 대상에 **결과 미상인 다른 의도**가 붙잡혀 있다. 지금 의도는 보내면 안 된다 —
   * 사용자는 이전 결과를 확인하거나 그 의도 그대로 재시도해야 한다.
   */
  | { ok: false; reason: "diverged" };

export interface KeyedOperationIntents<I> {
  /**
   * 이 대상·이 의도로 보낼 키와 **붙잡힌 불변 스냅샷**.
   * - 붙잡힌 의도가 없으면 새 키를 만들고, 의도의 detached 스냅샷을 함께 기록해 그대로 돌려준다.
   * - 붙잡힌 의도와 **같으면** 그 키와 이미 붙잡힌 스냅샷을 그대로 (진짜 재시도).
   * - 붙잡힌 의도와 **다르면** `diverged` — 키를 내주지 않는다.
   */
  begin: (id: string, intent: I) => OperationIntentLookup<I>;
  /**
   * 붙잡혀 있는 미확정 의도 (없으면 null) — 화면이 "그대로 재시도"를 정직하게 내주는 자리.
   * 재귀 동결된 스냅샷을 그대로 돌려준다 — 받은 쪽이 이 값을 바꿔도 붙잡힌 스냅샷은 흔들리지 않는다.
   */
  retained: (id: string) => I | null;
  /** 확정 성공(`settle(id)`) 또는 확정 4xx 에서만 키와 의도를 함께 버린다. */
  settle: (id: string, error?: unknown) => void;
  reset: (id: string) => void;
}

export function useKeyedOperationIntents<I>(maxEntries: number = DEFAULT_MAX_KEYS): KeyedOperationIntents<I> {
  const entriesRef = useRef<Map<string, { key: string; intent: I }>>(new Map());

  const begin = useCallback(
    (id: string, intent: I): OperationIntentLookup<I> => {
      const entries = entriesRef.current;
      const existing = entries.get(id);

      if (existing !== undefined) {
        // 같은 의도의 재시도만 같은 키를 탄다. 다른 의도면 이 키로 나갈 수 없다.
        // 비교는 호출부 객체로 하되, 나가는 건 **붙잡힌 스냅샷**이다.
        return sameOperationIntent(existing.intent, intent)
          ? { ok: true, key: existing.key, intent: existing.intent }
          : { ok: false, reason: "diverged" };
      }

      // 상한 도달 — 자리를 만들려고 미확정 키를 버리는 대신 새 조작을 거절한다.
      if (entries.size >= maxEntries) return { ok: false, reason: "capacity" };

      // 호출부 참조가 아니라 detached·재귀 동결 스냅샷을 붙잡는다 — begin 이후 화면이 값을
      // 편집해도 첫 전송·재시도는 이 스냅샷 그대로 나간다.
      const snapshot = detachOperationIntent(intent);
      const key = newOperationKey();
      entries.set(id, { key, intent: snapshot });
      return { ok: true, key, intent: snapshot };
    },
    [maxEntries],
  );

  const retained = useCallback((id: string): I | null => entriesRef.current.get(id)?.intent ?? null, []);

  const settle = useCallback((id: string, error?: unknown) => {
    if (error === undefined || isDefinitiveFailure(error)) entriesRef.current.delete(id);
  }, []);

  const reset = useCallback((id: string) => {
    entriesRef.current.delete(id);
  }, []);

  // 참조 안정성 — 이 핸들을 deps 에 넣는 useCallback 이 매 렌더 재생성되지 않게 한다.
  return useMemo(() => ({ begin, retained, settle, reset }), [begin, retained, settle, reset]);
}

export function useKeyedOperationKeys(maxEntries: number = DEFAULT_MAX_KEYS): KeyedOperationKeys {
  const keysRef = useRef<Map<string, string>>(new Map());

  const keyFor = useCallback(
    (id: string): OperationKeyLookup => {
      const keys = keysRef.current;

      // 기존 미확정 키는 언제나 그대로 돌려준다 — 재시도가 새 키를 만들면 안 된다.
      const existing = keys.get(id);
      if (existing) return { ok: true, key: existing };

      // 상한 도달 — 자리를 만들려고 미확정 키를 버리는 대신 새 조작을 거절한다.
      if (keys.size >= maxEntries) return { ok: false, reason: "capacity" };

      const key = newOperationKey();
      keys.set(id, key);
      return { ok: true, key };
    },
    [maxEntries],
  );

  const settle = useCallback((id: string, error?: unknown) => {
    if (error === undefined || isDefinitiveFailure(error)) keysRef.current.delete(id);
  }, []);

  const reset = useCallback((id: string) => {
    keysRef.current.delete(id);
  }, []);

  // 참조 안정성 — 이 핸들을 deps 에 넣는 useCallback 이 매 렌더 재생성되지 않게 한다.
  return useMemo(() => ({ keyFor, settle, reset }), [keyFor, settle, reset]);
}
