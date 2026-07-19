/**
 * 의도 비교 테스트 (node:test + tsx).
 *
 * 이 술어 하나가 "같은 키로 다른 조작을 보내는" 사고를 막는 자리다: 결과 미상으로 키가 살아
 * 있는 동안 페이로드가 조금이라도 달라지면 그 키로 나가면 안 된다. 훅은 React 상태를 쓰므로
 * 여기서는 그 판정의 **순수한 심장**만 직접 본다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detachOperationIntent, isDefinitiveFailure, sameOperationIntent } from "./idempotency";
import { ApiError } from "./problem";

describe("sameOperationIntent — 정확히 같은 의도만 같다", () => {
  it("스칼라는 값으로 본다", () => {
    assert.equal(sameOperationIntent("a", "a"), true);
    assert.equal(sameOperationIntent(1, 1), true);
    assert.equal(sameOperationIntent(null, null), true);
    assert.equal(sameOperationIntent("a", "b"), false);
    assert.equal(sameOperationIntent(1, "1"), false);
    assert.equal(sameOperationIntent(null, undefined), false);
  });

  it("키 순서는 의도가 아니다 — 같은 본문이다", () => {
    assert.equal(
      sameOperationIntent(
        { action: "cancel", familyBookingId: "fb-1", cancellationType: "PHONE" },
        { cancellationType: "PHONE", familyBookingId: "fb-1", action: "cancel" },
      ),
      true,
    );
  });

  it("참석이 바뀌면 다른 의도다 — 이 키로 내보내면 안 된다", () => {
    assert.equal(
      sameOperationIntent(
        { action: "changeParty", familyBookingId: "fb-1", attendanceParty: "MOTHER", expectedVersion: 3 },
        { action: "changeParty", familyBookingId: "fb-1", attendanceParty: "FATHER", expectedVersion: 3 },
      ),
      false,
    );
  });

  it("같은 가족의 변경과 취소는 다른 의도다", () => {
    assert.equal(
      sameOperationIntent(
        { action: "changeParty", familyBookingId: "fb-1", expectedVersion: 3, reason: "요청" },
        { action: "cancel", familyBookingId: "fb-1", expectedVersion: 3, cancellationType: "PHONE" },
      ),
      false,
    );
  });

  it("취소 갈래·버전이 달라지면 다른 의도다", () => {
    const base = { action: "cancel", familyBookingId: "fb-1", expectedVersion: 3, cancellationType: "PHONE" };
    assert.equal(sameOperationIntent(base, { ...base, cancellationType: "TEACHER" }), false);
    assert.equal(sameOperationIntent(base, { ...base, expectedVersion: 4 }), false);
  });

  it("배열 순서는 지킨다 — 다만 studentIds 는 호출부가 정렬해 넣는다", () => {
    assert.equal(sameOperationIntent({ studentIds: ["a", "b"] }, { studentIds: ["a", "b"] }), true);
    assert.equal(sameOperationIntent({ studentIds: ["a", "b"] }, { studentIds: ["b", "a"] }), false);
    assert.equal(sameOperationIntent({ studentIds: ["a"] }, { studentIds: ["a", "b"] }), false);
  });

  it("형제를 하나 더 담으면 다른 예약이다", () => {
    const base = { action: "createEnrolled", input: { seminarSessionId: "s-1", studentIds: ["a"], reason: "전화" } };
    assert.equal(
      sameOperationIntent(base, {
        action: "createEnrolled",
        input: { seminarSessionId: "s-1", studentIds: ["a", "b"], reason: "전화" },
      }),
      false,
    );
  });

  it("값이 undefined 인 키는 없는 키와 같다 — 계약 본문에서 둘은 같은 요청이다", () => {
    // GuestDialog 는 학교·학년이 비면 키 자체를 싣지 않는다. 두 표현이 갈리면
    // 같은 재시도가 `diverged` 로 오해받는다.
    assert.equal(sameOperationIntent({ name: "김수민", grade: undefined }, { name: "김수민" }), true);
    assert.equal(sameOperationIntent({ name: "김수민", grade: "중3" }, { name: "김수민" }), false);
  });

  it("undefined 인 키가 한쪽에만 있어도 개수를 같게 센다", () => {
    // keysOf 가 undefined 키를 양쪽에서 똑같이 걸러내야 length 비교가 어긋나지 않는다.
    assert.equal(sameOperationIntent({ a: 1, b: undefined }, { a: 1 }), true);
    assert.equal(sameOperationIntent({ a: 1 }, { a: 1, b: undefined }), true);
  });

  it("중첩된 게스트 본문까지 들여다본다", () => {
    const base = {
      action: "createGuest",
      input: { seminarSessionId: "s-1", contact: "01011112222", guest: { name: "김수민", branch: "SONGPA" } },
    };
    assert.equal(sameOperationIntent(base, structuredClone(base)), true);
    assert.equal(
      sameOperationIntent(base, {
        ...base,
        input: { ...base.input, guest: { name: "김수민", branch: "WIRYE" } },
      }),
      false,
    );
    // 연락처만 바뀌어도 다른 사람에게 가는 예약이다.
    assert.equal(sameOperationIntent(base, { ...base, input: { ...base.input, contact: "01099998888" } }), false);
  });
});

describe("detachOperationIntent — 붙잡은 스냅샷은 호출부와 완전히 분리되고 재귀 동결된다", () => {
  const allFrozen = (value: unknown): boolean => {
    if (value === null || typeof value !== "object") return true;
    if (!Object.isFrozen(value)) return false;
    if (Array.isArray(value)) return value.every(allFrozen);
    return Object.values(value as Record<string, unknown>).every(allFrozen);
  };

  it("원본의 중첩 객체를 나중에 바꿔도 스냅샷은 흔들리지 않는다", () => {
    // createGuest 의도 모양 — 편집 가능한 대화상자 상태를 흉내 낸다(합성 값만).
    const original = {
      action: "createGuest",
      input: { seminarSessionId: "s-1", contact: "01000000000", guest: { name: "학생1", branch: "SONGPA" } },
    };
    const snapshot = detachOperationIntent(original);

    // begin 이후 화면이 값을 편집한 상황.
    original.input.guest.name = "학생2";
    original.input.contact = "01099999999";

    assert.equal((snapshot.input.guest as { name: string }).name, "학생1");
    assert.equal(snapshot.input.contact, "01000000000");
    // 같은 의도의 재시도가 스냅샷과 같다고 보려면 편집 전 값이어야 한다.
    assert.equal(
      sameOperationIntent(snapshot, {
        action: "createGuest",
        input: { seminarSessionId: "s-1", contact: "01000000000", guest: { name: "학생1", branch: "SONGPA" } },
      }),
      true,
    );
  });

  it("원본 배열에 나중에 형제를 밀어 넣어도 스냅샷 배열은 그대로다", () => {
    const original = { action: "createEnrolled", input: { studentIds: ["a", "b"] } };
    const snapshot = detachOperationIntent(original);

    original.input.studentIds.push("c");

    assert.deepEqual(snapshot.input.studentIds, ["a", "b"]);
  });

  it("스냅샷은 모든 깊이에서 동결돼 받은 쪽이 바꿀 수 없다", () => {
    const snapshot = detachOperationIntent({
      action: "changeParty",
      familyBookingId: "fb-1",
      nested: { list: [{ k: 1 }] },
    });

    assert.equal(allFrozen(snapshot), true);
    // 동결됐으므로 변경 시도는 조용히 무시되거나(느슨한 모드) 던진다 — 어느 쪽이든 값은 안 바뀐다.
    try {
      (snapshot as { familyBookingId: string }).familyBookingId = "fb-2";
    } catch {
      /* strict mode 에서 던지는 건 정상 */
    }
    assert.equal(snapshot.familyBookingId, "fb-1");
  });

  it("객체/배열은 새 참조로 복제된다 — 원본과 신원을 공유하지 않는다", () => {
    const original = { action: "cancel", input: { studentIds: ["a"] } };
    const snapshot = detachOperationIntent(original);

    assert.notEqual(snapshot, original);
    assert.notEqual(snapshot.input, original.input);
    assert.notEqual(snapshot.input.studentIds, original.input.studentIds);
    // 값은 같다.
    assert.deepEqual(snapshot, original);
  });

  it("스칼라는 그대로 통과한다", () => {
    assert.equal(detachOperationIntent("a"), "a");
    assert.equal(detachOperationIntent(3), 3);
    assert.equal(detachOperationIntent(null), null);
  });
});

describe("isDefinitiveFailure — 4xx 만 키를 놓아준다", () => {
  const apiError = (status: number) =>
    new ApiError({ kind: "problem", status, code: "X", message: "x" });

  it("4xx 는 확정 실패다 — 재시도해도 같은 결과이므로 키를 버린다", () => {
    assert.equal(isDefinitiveFailure(apiError(400)), true);
    assert.equal(isDefinitiveFailure(apiError(403)), true);
    assert.equal(isDefinitiveFailure(apiError(409)), true);
    assert.equal(isDefinitiveFailure(apiError(499)), true);
  });

  it("5xx·네트워크·취소는 결과 미상이다 — 키를 유지해 같은 키로만 재시도한다", () => {
    assert.equal(isDefinitiveFailure(apiError(500)), false);
    assert.equal(isDefinitiveFailure(apiError(503)), false);
    assert.equal(isDefinitiveFailure(new ApiError({ kind: "aborted", status: 0, code: "X", message: "x" })), false);
    assert.equal(isDefinitiveFailure(new Error("network")), false);
  });
});
