/**
 * 결과 미상으로 붙잡힌 의도를 **그대로 재시도**했을 때, 그 성공이 어느 변경 대화상자를 닫아야
 * 하는지를 잇는 순수 매핑.
 *
 * 왜 필요한가: 재시도는 붙잡힌(옛) 페이로드를 보낸다. 그게 성공했는데 그 조작을 시작했던
 * 대화상자(참석 변경·취소·재원생 예약·비재원생 예약)가 열린 채 **편집된 값**을 그대로 보여 주면,
 * 사용자가 다시 제출을 눌러 *새 키*로 같은 변경을 중복 발행할 수 있다. 그래서 재시도가 확정 성공하면
 * 그 의도에 해당하는 대화상자를 닫아 다시 제출할 길을 막는다.
 *
 * 순수 함수로 떼어 두는 이유: 훅은 React 상태를 쓰지만 "어떤 action → 어떤 대화상자"라는 규칙은
 * 상태 없이 검증할 수 있어야 한다.
 */

/** 변경 조작의 종류 — `useBookingMutations` 의 의도 action 과 1:1 이다. */
export type BookingMutationKind = "changeParty" | "cancel" | "rollbackCheckIn" | "changeTestBranch" | "createEnrolled" | "createGuest";

/** 화면이 여닫는 변경 대화상자들. */
export type MutationDialogId =
  /** 참석 학부모 변경·취소 확인 (`ConfirmRequestDialog`). */
  | "confirm"
  /** 재원생 수동/재예약 (`ManualBookingDialog`). */
  | "manualEnrolled"
  /** 비재원생 수동 추가·재예약 (`GuestDialog`, 전역/행 밑값 둘 다). */
  | "guest";

/** 재시도한 의도의 action → 성공 시 닫아야 할 대화상자들. */
export function mutationDialogsForRetainedAction(action: BookingMutationKind): MutationDialogId[] {
  switch (action) {
    case "changeParty":
    case "cancel":
      return ["confirm"];
    // 입장 취소·캠퍼스 변경은 확인 대화상자를 거치지 않는다 — 테스트 예약에만 뜨고
    // 되돌려도 잃는 것이 없다.
    case "rollbackCheckIn":
    case "changeTestBranch":
      return [];
    case "createEnrolled":
      return ["manualEnrolled"];
    case "createGuest":
      return ["guest"];
  }
}

/** 재시도 결과 — 성공이면 어느 action 이었는지 실어 준다(그 action 이 닫을 대화상자를 정한다). */
export type RetainedRetryOutcome = { ok: false } | { ok: true; action: BookingMutationKind };
