"use client";

// 변경 요청 Idempotency-Key 수명 관리
// 어댑터가 호출마다 새 UUID를 만들면 응답 유실 후 재시도가 서버에는 다른 조작으로 보여 중복 변경(코드 2개 발급, 이중 체크인)이 생김
// - 키는 사용자가 의도한 조작 1건 단위로 만들고 결과를 모르는 동안 계속 재사용
// - 확정 성공 또는 확정 4xx에서만 버림. 네트워크 실패·취소·5xx는 결과를 몰라 유지
// - ref(메모리)에만 두고 웹 스토리지에 쓰지 않음

import { useCallback, useMemo, useRef } from "react";
import { isApiError } from "./problem";

/**
 * 새 조작 키(UUID) 생성. 모듈 내부 전용
 *
 * 조작마다 즉석에서 키를 만드는 것이 중복 변경의 원인이라 수명을 관리하는 아래 훅만 생성 가능
 */
function newOperationKey(): string {
  return crypto.randomUUID();
}

/**
 * 서버가 요청을 확정적으로 거절했는지 여부
 *
 * 4xx는 재시도해도 같은 결과라 키를 놓아줌. 네트워크·취소(status 0)·5xx는 서버가 이미 처리했을 수 있어 키 유지
 */
export function isDefinitiveFailure(error: unknown): boolean {
  return isApiError(error) && error.status >= 400 && error.status < 500;
}

// 결과 불명(network·abort·5xx): 서버가 변경을 이미 적용했을 수도 아닐 수도 있음
// 이때는 새 키로 재시도하면 안 되고, 성공·실패를 단정하기 전에 서버 상태를 다시 조회해야 함(reconcileScanner*)
// 별도 함수 없이 `!isDefinitiveFailure(error)`로 판정해 두 술어가 어긋날 여지를 없앰

/**
 * 단일 조작 키 핸들
 */
export interface OperationKeyHandle {
  /**
   * 이번 시도에 쓸 키. 미확정 재시도는 같은 값을 받음
   */
  current: () => string;

  /**
   * 새 조작을 시작할 때 키를 명시적으로 버림
   */
  reset: () => void;

  /**
   * 시도 결과 반영. 인자 없음은 확정 성공, error는 실패
   *
   * 확정 실패(4xx)면 버리고 결과 불명이면 유지
   */
  settle: (error?: unknown) => void;
}

/**
 * 조작 1건의 Idempotency-Key 관리 훅
 */
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

  // 참조 안정성: 이 핸들을 의존성에 넣는 useCallback이 매 렌더 재생성되지 않게 함
  return useMemo(() => ({ current, reset, settle }), [current, reset, settle]);
}

// 대상별 키
// 같은 대상(QR 토큰·예약 ID) 재시도는 같은 키를 다시 쓰고 다른 대상은 별개 조작으로 취급
// 메모리(ref) 전용. 키와 키를 만드는 식별자(QR 토큰)를 저장·로깅하지 않음
// 미확정 키는 자동 축출하지 않음: settle이 확정 성공·확정 4xx에서 항목을 지우므로 맵에 남은 항목은 모두 결과 불명
// 가장 오래된 항목 축출은 미확정 키 폐기와 같고, 그 대상이 나중에 재시도되면 새 키가 나가 이중 체크인이 생김
// 상한은 안전장치로만 둠. 상한에 닿으면 새 대상에 키를 내주지 않고, 호출부는 변경 요청을 보내지 않고 미확정 건 정리를 안내
// 기존 미확정 키 조회는 상한과 무관하게 항상 성공

/**
 * 키 조회 결과. 실패를 예외가 아니라 타입으로 표현
 */
export type OperationKeyLookup =
  | { ok: true; key: string }

  /**
   * 미확정 조작이 상한만큼 쌓여 새 조작을 시작할 수 없음. 기존 조작을 재시도·정리해 확정하면 자리가 남
   */
  | { ok: false; reason: "capacity" };

/**
 * 대상별 키 핸들
 */
export interface KeyedOperationKeys {
  /**
   * 식별자별 키 조회
   *
   * 이미 미확정 키가 있으면 상한과 무관하게 ok. 새 식별자인데 상한에 닿았으면 capacity이고 키를 만들지 않음
   */
  keyFor: (id: string) => OperationKeyLookup;

  /**
   * 확정 성공(`settle(id)`) 또는 확정 4xx에서만 키를 버림
   */
  settle: (id: string, error?: unknown) => void;

  /**
   * 대상의 키를 명시적으로 버림
   */
  reset: (id: string) => void;
}

/**
 * 안전 상한. 무한 증가를 막되 도달 시 축출이 아니라 신규 발급 거부로 동작
 */
const DEFAULT_MAX_KEYS = 50;

// 의도 고정 키
// 키만 붙잡아서는 부족하고 무엇에 대한 키인지도 붙잡아야 함
// useKeyedOperationKeys는 대상별로 키를 유지하는데, 결과 불명으로 키가 남은 동안 사용자가 다른 내용을 보내면(참석 보호자 변경, 변경 대신 취소)
// 같은 키에 다른 본문이 나가 서버의 멱등 불일치나, 첫 요청이 이미 적용됐는데 두 번째 의도가 덮어쓰는 중복 변경이 생김
// 그래서 키와 불변 의도 본문을 함께 붙잡음
// - 결과 불명이면 그때 보낸 본문을 키와 함께 그대로 보관
// - 같은 의도로 다시 오면 그 키 재사용(진짜 재시도)
// - 다른 의도로 오면 키를 내주지 않고, 호출부는 보내지 않고 사용자에게 안내
// - 확정 성공·확정 4xx면 키와 의도를 함께 버림
// 메모리(ref) 전용. 의도에 연락처 원문이 있을 수 있어 문자열로 굳혀 저장·로깅하지 않고 구조 비교만 함

/**
 * 두 의도가 정확히 같은지 구조 비교
 *
 * 의도는 계약 요청 본문이라 JSON 스칼라·배열·일반 객체만 옴(Date·Map·순환 참조 없음)
 * 객체 키 순서는 무시하고 배열 순서는 지킴. undefined 값 키는 계약 본문의 없는 키와 같아 `{ grade: undefined }`와 `{}`는 같음
 * JSON.stringify 비교를 쓰지 않는 이유: 키 순서만 달라도 다르게 보이고, 연락처가 통째로 담긴 문자열을 만들게 됨
 */
export function sameOperationIntent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => sameOperationIntent(item, right[index]));
  }

  // undefined가 아닌 키 목록을 비교하고 각 값을 재귀 비교
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
 * 붙잡을 의도를 호출부 객체와 분리된 불변 스냅샷으로 복제
 *
 * 호출부 객체는 대화상자 상태와 연결돼 begin 이후에도 편집될 수 있음. 참조를 그대로 들고 있으면 첫 전송·재시도가 현재 화면 값을 실어 보냄
 * 그래서 begin이 새 의도를 받을 때 재귀 복제·재귀 동결한 스냅샷을 붙잡고 첫 전송과 재시도 모두 그 값만 사용
 * JSON.stringify 없이 구조만 복제해 연락처가 담긴 문자열을 만들지 않음. undefined 값은 그대로 옮김
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

/**
 * 의도까지 대조한 키 조회 결과
 */
export type OperationIntentLookup<I> =
  | {
      /**
       * 키 발급 성공
       */
      ok: true;

      /**
       * 이번 시도에 쓸 키
       */
      key: string;

      /**
       * 붙잡힌 불변 스냅샷. 첫 전송과 재시도는 편집될 수 있는 호출부 객체가 아니라 이 값으로만 보내 보내는 값과 붙잡은 값이 갈라지지 않게 함
       */
      intent: I;
    }
  | { ok: false; reason: "capacity" }

  /**
   * 이 대상에 결과 불명인 다른 의도가 붙잡혀 있음. 지금 의도는 보내면 안 되고, 사용자는 이전 결과를 확인하거나 그 의도 그대로 재시도해야 함
   */
  | { ok: false; reason: "diverged" };

/**
 * 대상별 의도 고정 키 핸들
 */
export interface KeyedOperationIntents<I> {
  /**
   * 이 대상·의도로 보낼 키와 붙잡힌 불변 스냅샷
   *
   * 붙잡힌 의도가 없으면 새 키를 만들고 의도 스냅샷을 함께 기록해 반환
   * 붙잡힌 의도와 같으면 그 키와 스냅샷 반환(진짜 재시도), 다르면 diverged로 키를 내주지 않음
   */
  begin: (id: string, intent: I) => OperationIntentLookup<I>;

  /**
   * 붙잡힌 미확정 의도. 없으면 null
   *
   * 화면이 그대로 재시도를 제공하는 데 사용. 재귀 동결된 스냅샷이라 받은 쪽이 바꿀 수 없음
   */
  retained: (id: string) => I | null;

  /**
   * 확정 성공(`settle(id)`) 또는 확정 4xx에서만 키와 의도를 함께 버림
   */
  settle: (id: string, error?: unknown) => void;

  /**
   * 대상의 키와 의도를 명시적으로 버림
   */
  reset: (id: string) => void;
}

/**
 * 대상별 의도 고정 Idempotency-Key 관리 훅
 *
 * @param maxEntries 미확정 대상 상한. 기본 50
 */
export function useKeyedOperationIntents<I>(maxEntries: number = DEFAULT_MAX_KEYS): KeyedOperationIntents<I> {
  const entriesRef = useRef<Map<string, { key: string; intent: I }>>(new Map());

  const begin = useCallback(
    (id: string, intent: I): OperationIntentLookup<I> => {
      const entries = entriesRef.current;
      const existing = entries.get(id);

      if (existing !== undefined) {
        // 같은 의도의 재시도만 같은 키를 씀. 비교는 호출부 객체로 하지만 보내는 값은 붙잡힌 스냅샷
        return sameOperationIntent(existing.intent, intent)
          ? { ok: true, key: existing.key, intent: existing.intent }
          : { ok: false, reason: "diverged" };
      }

      // 상한 도달 시 자리를 만들려고 미확정 키를 버리지 않고 새 조작을 거부
      if (entries.size >= maxEntries) return { ok: false, reason: "capacity" };

      // 호출부 참조가 아닌 분리·동결 스냅샷을 붙잡아 begin 이후 화면 편집과 무관하게 같은 값을 전송
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

  // 참조 안정성: 이 핸들을 의존성에 넣는 useCallback이 매 렌더 재생성되지 않게 함
  return useMemo(() => ({ begin, retained, settle, reset }), [begin, retained, settle, reset]);
}

/**
 * 대상별 Idempotency-Key 관리 훅
 *
 * @param maxEntries 미확정 대상 상한. 기본 50
 */
export function useKeyedOperationKeys(maxEntries: number = DEFAULT_MAX_KEYS): KeyedOperationKeys {
  const keysRef = useRef<Map<string, string>>(new Map());

  const keyFor = useCallback(
    (id: string): OperationKeyLookup => {
      const keys = keysRef.current;

      // 기존 미확정 키는 항상 그대로 반환. 재시도가 새 키를 만들면 안 됨
      const existing = keys.get(id);
      if (existing) return { ok: true, key: existing };

      // 상한 도달 시 자리를 만들려고 미확정 키를 버리지 않고 새 조작을 거부
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

  // 참조 안정성: 이 핸들을 의존성에 넣는 useCallback이 매 렌더 재생성되지 않게 함
  return useMemo(() => ({ keyFor, settle, reset }), [keyFor, settle, reset]);
}
