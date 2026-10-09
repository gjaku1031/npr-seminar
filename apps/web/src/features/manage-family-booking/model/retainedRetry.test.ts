/**
 * 재시도 성공 → 대화상자 닫기 매핑 테스트 (node:test + tsx)
 *
 * 순수 규칙 하나만 지킴: 붙잡힌 의도를 그대로 재시도해 성공하면, 그 조작을 시작했던
 * 대화상자만 닫아 편집된 값으로 다시 제출(=새 키로 중복 발행)하는 길을 막음
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mutationDialogsForRetainedAction, type BookingMutationKind } from "./retainedRetry";

describe("mutationDialogsForRetainedAction — action 이 닫을 대화상자를 정확히 짚는다", () => {
  it("참석 변경·취소는 확인 대화상자를 닫는다", () => {
    assert.deepEqual(mutationDialogsForRetainedAction("changeParty"), ["confirm"]);
    assert.deepEqual(mutationDialogsForRetainedAction("cancel"), ["confirm"]);
  });

  it("재원생 예약은 재원생 대화상자를 닫는다", () => {
    assert.deepEqual(mutationDialogsForRetainedAction("createEnrolled"), ["manualEnrolled"]);
  });

  it("비재원생 예약은 게스트 대화상자를 닫는다", () => {
    assert.deepEqual(mutationDialogsForRetainedAction("createGuest"), ["guest"]);
  });

  it("모든 action 이 정확히 하나의 대화상자로 이어진다 — 빠지거나 겹치지 않는다", () => {
    const actions: BookingMutationKind[] = ["changeParty", "cancel", "createEnrolled", "createGuest"];
    for (const action of actions) {
      const dialogs = mutationDialogsForRetainedAction(action);
      assert.equal(dialogs.length, 1, `${action} 는 대화상자 하나여야 한다`);
    }
  });
});
