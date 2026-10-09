"use client";

/**
 * 가족 예약 변경 — 참석 학부모 변경 · 취소 · 재원생 수동 예약 · 비재원 수동 추가
 *
 * 넷 다 계약이 `Idempotency-Key` 를 요구하므로 키 수명을 여기서 관리함
 *
 * ── 키 수명과 의도는 같이 간다 ────────────────────────────────────────
 * 키만 붙잡아 두면 이런 구멍이 남음: 결과 미상(네트워크 끊김·취소·5xx)으로 키가 살아 있는
 * 동안 사용자가 참석을 모→부로 바꾸거나, 변경 대신 취소를 고르면, 같은 키에 다른 본문이
 * 나감. 서버에는 idempotency 불일치이거나 — 더 나쁘게는 — 첫 요청이 이미 적용된 위에
 * 다른 의도가 덧씌워지는 중복 durable 변경임
 *
 * 그래서 `useKeyedOperationIntents` 로 키와 그때 보낸 불변 페이로드를 함께 붙잡음:
 * 같은 의도의 재시도만 그 키를 타고, 다른 의도는 아예 보내지 않고 사용자에게 알림
 * 확정 성공·확정 4xx 면 키와 의도를 함께 놓아줌
 *
 * 의도는 메모리(ref)에만 있음. 연락처가 들어 있으므로 문자열로 굳히거나 로깅하지 않음
 */

import { useCallback, useState } from "react";
import {
  BOOKING_VERSION_CONFLICT_CODE,
  cancelAdminFamilyBooking,
  rollbackFamilyBookingCheckIn,
  changeTestBookingBranch,
  changeFamilyBookingAttendanceParty,
  createAdminEnrolledFamilyBooking,
  createAdminGuestFamilyBooking,
  useKeyedOperationIntents,
} from "@/shared/api";
import type { AdminCancellationType, AttendanceParty, Branch, CreateEnrolledBookingInput, CreateGuestBookingInput } from "@/shared/api";
import { defaultErrorMessage, isApiError } from "@/shared/api";
import type { RetainedRetryOutcome } from "./retainedRetry";

/**
 * 관리자 예약 변경 조작 상태와 실행 함수
 */
export interface BookingMutationsState {
  /**
   * 지금 서버로 나가 있는 조작의 대상 familyBookingId (없으면 null)
   */
  pendingId: string | null;

  /**
   * 오류 문구. 없으면 null
   */
  error: string | null;

  /**
   * 성공 안내 문구. 없으면 null
   */
  notice: string | null;

  /**
   * 안내·오류 문구 지우기
   */
  dismiss: () => void;
  /**
   * 결과 미상으로 붙잡혀 있는 의도를 그대로 다시 보내는 갈래 (없으면 null)
   *
   * 화면이 편집된 값을 보여 주면서 몰래 옛 페이로드를 보내면 안 되므로, 재시도는 언제나
   * 사용자가 눌러서 일어나는 명시적 조작으로만 둠
   *
   * 성공하면 어느 action 이었는지 실어 줌 — 화면은 그걸로 그 조작을 시작했던 대화상자를
   *   닫음. 재시도는 붙잡힌(옛) 페이로드를 보내므로, 성공 뒤 편집된 값이 뜬 대화상자를 열어
   *   두면 사용자가 새 키로 같은 변경을 다시 제출해 중복 발행할 수 있음
   */
  retryRetained: (() => Promise<RetainedRetryOutcome>) | null;

  /**
   * 참석 보호자 변경. 성공하면 true
   */
  changeParty: (input: {
    /**
     * 가족 예약 ID
     */
    familyBookingId: string;

    /**
     * 참석 보호자
     */
    attendanceParty: AttendanceParty;

    /**
     * 현재 버전. 다르면 409
     */
    expectedVersion: number;

    /**
     * 변경 사유
     */
    reason: string;
  }) => Promise<boolean>;
  /**
   * 테스트 예약 전용 입장 취소. 서버가 isTest 가 아니면 409 로 막음
   */
  rollbackCheckIn: (familyBookingId: string) => Promise<boolean>;
  /**
   * 테스트 예약 전용 캠퍼스 변경. 서버가 isTest 가 아니면 409 로 막음
   */
  changeTestBranch: (familyBookingId: string, branch: Branch) => Promise<boolean>;

  /**
   * 예약 취소. 성공하면 true
   */
  cancel: (input: {
    /**
     * 가족 예약 ID
     */
    familyBookingId: string;

    /**
     * 현재 버전. 다르면 409
     */
    expectedVersion: number;

    /**
     * 취소 유형
     */
    cancellationType: AdminCancellationType;
  }) => Promise<boolean>;

  /**
   * 비재원생 수동 예약. 성공하면 true
   */
  addGuest: (input: CreateGuestBookingInput) => Promise<boolean>;

  /**
   * 비재원생 예약 처리 중 여부
   */
  guestPending: boolean;
  /**
   * 재원생 수동 예약 — 취소된 행의 재예약도 이 경로임(옛 집계는 건드리지 않음)
   */
  addEnrolled: (input: CreateEnrolledBookingInput) => Promise<boolean>;

  /**
   * 재원생 예약 처리 중 여부
   */
  enrolledPending: boolean;
}

/**
 * 낙관적 잠금이 어긋났다 = 내가 읽은 뒤 누군가 바꿨음. 다시 읽어야 함
 */
const CONFLICT_MESSAGE = "다른 곳에서 먼저 변경됐어요. 최신 상태를 다시 불러왔어요.";

/**
 * 결과 미상 의도가 상한에 닿았을 때 안내 문구
 */
const CAPACITY_MESSAGE = "결과를 확인하지 못한 조작이 너무 많아요. 먼저 그 건들을 정리해 주세요.";

/**
 * 결과 미상인 다른 의도가 붙잡혀 있음 — 지금 내용은 보낼 수 없음
 * 지어낼 수 있는 선택지는 둘뿐이고, 둘 다 정직함: 결과를 확인하거나, 그대로 재시도함
 */
const DIVERGED_MESSAGE =
  "직전 요청의 결과를 확인하지 못했어요. 명단을 새로 불러 결과를 확인하거나, 같은 요청을 그대로 다시 시도해 주세요 — 내용이 다른 요청은 보낼 수 없어요.";

/**
 * 조작 하나의 불변 의도. 여기 담긴 값이 그대로 서버 본문이 됨 — 보내는 것과 붙잡는 것이
 * 갈라질 수 없게 한 벌로 둠
 */
type BookingIntent =
  | { action: "changeParty"; familyBookingId: string; attendanceParty: AttendanceParty; expectedVersion: number; reason: string }
  | { action: "cancel"; familyBookingId: string; expectedVersion: number; cancellationType: AdminCancellationType }
  /**
   * 테스트 예약만 — 서버가 isTest 가 아닌 예약을 거절함. 버전을 실지 않음(되돌림은 상태 하나뿐)
   */
  | { action: "rollbackCheckIn"; familyBookingId: string }
  /**
   * 테스트 예약만 — 캠퍼스별 문자 발송을 확인하려고 리허설 예약을 옮김
   */
  | { action: "changeTestBranch"; familyBookingId: string; branch: Branch }
  | {
      /**
       * 의도 종류
       */
      action: "createEnrolled";
      /**
       * 대화상자를 연 그 행의 학생 — 대상 식별용이지 본문이 아님
       * `input.studentIds` 로 대상을 잡으면 형제 체크를 바꾼 순간 *다른 대상*이 되어 새 키가
       * 나감. 첫 요청이 이미 통했다면 그게 곧 중복 예약 시도임. 행은 그대로이므로 행으로 잡음
       */
      primaryStudentId: string;

      /**
       * 예약 생성 입력
       */
      input: CreateEnrolledBookingInput;
    }
  | { action: "createGuest"; input: CreateGuestBookingInput };

/**
 * 의도의 대상 — 이 단위로 키를 붙잡음
 *
 * 예약된 건은 가족 예약 집계가 대상임. 새로 만드는 건은 아직 집계가 없으므로 "어디서 만드는
 * 중인가"가 대상임: 재원생은 대화상자를 연 행, 비재원생은 그 회차의 게스트 생성 한 갈래임
 *
 * 게스트는 회차 하나에 대상이 하나임. 그래서 결과 미상인 게스트 추가가 있으면 *다른* 게스트
 *   추가도 그 건이 확정될 때까지 막힘. 일부러 그렇게 둠: 대상을 이름·연락처로 잘게 쪼개면
 *   "이름을 고쳐 다시 보내기"가 새 키를 타고 나가 중복 예약이 됨. 막힘은 그 건을 그대로
 *   재시도하면 곧 풀림
 *
 * 대상 문자열에 연락처를 넣지 않음
 */
function intentTarget(intent: BookingIntent): string {
  switch (intent.action) {
    case "changeParty":
    case "cancel":
    case "rollbackCheckIn":
    case "changeTestBranch":
      return `booking:${intent.familyBookingId}`;
    case "createEnrolled":
      return `enrolled:${intent.input.seminarSessionId}:${intent.primaryStudentId}`;
    case "createGuest":
      return `guest:${intent.input.seminarSessionId}`;
  }
}

/**
 * 의도 하나를 계약 호출로 — 이 함수만 서버로 나감
 */
function send(intent: BookingIntent, idempotencyKey: string): Promise<unknown> {
  switch (intent.action) {
    case "changeParty":
      return changeFamilyBookingAttendanceParty(
        {
          familyBookingId: intent.familyBookingId,
          attendanceParty: intent.attendanceParty,
          expectedVersion: intent.expectedVersion,
          reason: intent.reason,
        },
        { idempotencyKey },
      );
    case "cancel":
      return cancelAdminFamilyBooking(
        {
          familyBookingId: intent.familyBookingId,
          expectedVersion: intent.expectedVersion,
          cancellationType: intent.cancellationType,
        },
        { idempotencyKey },
      );
    case "rollbackCheckIn":
      return rollbackFamilyBookingCheckIn(intent.familyBookingId, { idempotencyKey });
    case "changeTestBranch":
      return changeTestBookingBranch(intent.familyBookingId, intent.branch, { idempotencyKey });
    case "createEnrolled":
      return createAdminEnrolledFamilyBooking(intent.input, { idempotencyKey });
    case "createGuest":
      return createAdminGuestFamilyBooking(intent.input, { idempotencyKey });
  }
}

/**
 * 의도 종류별 성공 안내 문구
 */
const SUCCESS_NOTICE: Record<BookingIntent["action"], string> = {
  changeParty: "참석 학부모를 변경했어요.",
  cancel: "예약을 취소했어요.",
  rollbackCheckIn: "입장을 취소했어요. 같은 QR로 다시 테스트할 수 있어요.",
  changeTestBranch: "테스트 계정의 캠퍼스를 옮겼어요.",
  createEnrolled: "예약을 추가했어요.",
  createGuest: "비재원생 예약을 추가했어요.",
};

/**
 * 관리자 예약 변경 훅. 의도별 멱등 키를 유지하고 성공하면 onChanged 호출
 */
export function useBookingMutations(onChanged: () => void): BookingMutationsState {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [guestPending, setGuestPending] = useState(false);
  const [enrolledPending, setEnrolledPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 결과 미상으로 붙잡혀 "그대로 재시도"가 가능한 의도 — 화면이 버튼 하나로 내주는 값임
  const [retained, setRetained] = useState<BookingIntent | null>(null);

  const intents = useKeyedOperationIntents<BookingIntent>();

  const run = useCallback(
    async (intent: BookingIntent): Promise<boolean> => {
      const target = intentTarget(intent);
      const lookup = intents.begin(target, intent);

      if (!lookup.ok) {
        if (lookup.reason === "capacity") {
          setError(CAPACITY_MESSAGE);
        } else {
          // 다른 의도가 미확정으로 남아 있음 — 지금 내용은 보내지 않고, 그 의도를 재시도 갈래로 내줌
          setError(DIVERGED_MESSAGE);
          setRetained(intents.retained(target));
        }
        setNotice(null);
        return false;
      }

      const creating = intent.action === "createEnrolled" || intent.action === "createGuest";
      if (intent.action === "createGuest") setGuestPending(true);
      if (intent.action === "createEnrolled") setEnrolledPending(true);
      if (!creating) setPendingId(intent.familyBookingId);
      setError(null);
      setNotice(null);

      try {
        // 호출부 객체가 아니라 begin 이 붙잡은 불변 스냅샷으로 보냄 — 첫 전송도, 재시도도
        // 대화상자에서 편집됐을 수 있는 값이 아니라 그때 굳힌 페이로드 그대로 나감
        await send(lookup.intent, lookup.key);
        intents.settle(target);
        setRetained(null);
        setNotice(SUCCESS_NOTICE[intent.action]);
        onChanged();
        return true;
      } catch (caught) {
        intents.settle(target, caught);
        // settle 이 놓아줬으면(확정 성공·확정 4xx) 붙잡을 의도가 없음 — 남아 있으면 결과 미상임
        setRetained(intents.retained(target));

        if (isApiError(caught) && caught.code === BOOKING_VERSION_CONFLICT_CODE) {
          setError(CONFLICT_MESSAGE);
          // 버전 충돌은 서버가 진실임 — 추측하지 말고 다시 읽음
          onChanged();
        } else {
          setError(defaultErrorMessage(caught));
        }
        return false;
      } finally {
        setPendingId(null);
        setGuestPending(false);
        setEnrolledPending(false);
      }
    },
    [intents, onChanged],
  );

  const changeParty: BookingMutationsState["changeParty"] = useCallback(
    (input) =>
      run({
        action: "changeParty",
        familyBookingId: input.familyBookingId,
        attendanceParty: input.attendanceParty,
        expectedVersion: input.expectedVersion,
        reason: input.reason,
      }),
    [run],
  );

  const cancel: BookingMutationsState["cancel"] = useCallback(
    (input) =>
      run({
        action: "cancel",
        familyBookingId: input.familyBookingId,
        expectedVersion: input.expectedVersion,
        cancellationType: input.cancellationType,
      }),
    [run],
  );

  // 테스트 예약을 다시 미입장으로 — QR 리허설을 반복하기 위한 유일한 경로임
  const rollbackCheckIn: BookingMutationsState["rollbackCheckIn"] = useCallback(
    (familyBookingId) => run({ action: "rollbackCheckIn", familyBookingId }),
    [run],
  );

  const changeTestBranch: BookingMutationsState["changeTestBranch"] = useCallback(
    (familyBookingId, branch) => run({ action: "changeTestBranch", familyBookingId, branch }),
    [run],
  );

  const addGuest: BookingMutationsState["addGuest"] = useCallback(
    (input) => (guestPending ? Promise.resolve(false) : run({ action: "createGuest", input })),
    [guestPending, run],
  );

  const addEnrolled: BookingMutationsState["addEnrolled"] = useCallback(
    (input) => {
      if (enrolledPending) return Promise.resolve(false);

      // 대화상자는 언제나 그 행의 학생을 맨 앞에 넣음 — 그게 이 조작의 대상임
      const primaryStudentId = input.studentIds[0];
      if (primaryStudentId === undefined) return Promise.resolve(false);

      return run({
        action: "createEnrolled",
        primaryStudentId,
        // studentIds 순서는 의도가 아님(형제를 어떤 차례로 눌렀든 같은 예약임) —
        // 정렬해 두어야 같은 선택의 재시도가 "다른 의도"로 오해받지 않음
        input: { ...input, studentIds: [...input.studentIds].sort() },
      });
    },
    [enrolledPending, run],
  );

  const dismiss = useCallback(() => {
    setError(null);
    setNotice(null);
  }, []);

  const retryRetained = useCallback(async (): Promise<RetainedRetryOutcome> => {
    if (retained === null) return { ok: false };
    // action 은 재시도 전에 붙잡음 — run 이 성공하면 settle 이 retained 를 비우기 때문임
    const action = retained.action;
    const ok = await run(retained);
    return ok ? { ok: true, action } : { ok: false };
  }, [retained, run]);

  return {
    pendingId,
    error,
    notice,
    dismiss,
    retryRetained: retained === null ? null : retryRetained,
    changeParty,
    cancel,
    rollbackCheckIn,
    changeTestBranch,
    addGuest,
    guestPending,
    addEnrolled,
    enrolledPending,
  };
}
