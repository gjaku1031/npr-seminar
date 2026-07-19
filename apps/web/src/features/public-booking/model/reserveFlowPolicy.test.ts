/**
 * 예약 플로우 정책 순수 테스트 (node:test + tsx). 클라이언트 훅·컴포넌트를 import 하지 않는다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  Branch,
  FamilyBookingStudentSnapshot,
  PublicSeminarSession,
} from "../../../shared/api/contract";
import {
  bookingParticipantType,
  campusSessionCount,
  GUEST_BOOKING_DISABLED_MESSAGE,
  guestEntryState,
  isSessionBookableForType,
  manageErrorMessageForCode,
  moveTargetSessions,
  sessionsForType,
  type MoveSourceBooking,
} from "./reserveFlowPolicy";

function session(overrides: Partial<PublicSeminarSession> = {}): PublicSeminarSession {
  return {
    seminarId: "sem-1",
    seminarSessionId: "sess-1",
    seminarTitle: "설명회",
    scope: "BRANCH",
    branch: "CAMPUS_A",
    startsAt: "2026-08-21T01:00:00.000Z",
    endsAt: "2026-08-21T03:00:00.000Z",
    location: "A",
    bookingOpensAt: "2026-08-01T00:00:00.000Z",
    bookingClosesAt: "2026-08-20T00:00:00.000Z",
    guestBookingEnabled: false,
    availability: "AVAILABLE",
    remainingCapacity: 10,
    ...overrides,
  };
}

describe("guestEntryState — 로딩/오류/플래그 집합", () => {
  it("로딩 중이면 loading (플래그를 보지 않는다)", () => {
    assert.equal(guestEntryState(true, null, [session({ guestBookingEnabled: true })]), "loading");
  });

  it("오류면 error (실패 시 임의 활성화 금지)", () => {
    assert.equal(guestEntryState(false, "boom", [session({ guestBookingEnabled: true })]), "error");
  });

  it("guestBookingEnabled 회차가 하나라도 있으면 enabled", () => {
    assert.equal(
      guestEntryState(false, null, [session({ guestBookingEnabled: false }), session({ guestBookingEnabled: true })]),
      "enabled",
    );
  });

  it("전부 false 면 disabled", () => {
    assert.equal(guestEntryState(false, null, [session(), session()]), "disabled");
  });

  it("빈 목록이면 disabled", () => {
    assert.equal(guestEntryState(false, null, []), "disabled");
  });
});

describe("sessionsForType — 캠퍼스 가시성 + GUEST 플래그", () => {
  const campusAGuest = session({ seminarSessionId: "a", branch: "CAMPUS_A", guestBookingEnabled: true });
  const campusANoGuest = session({ seminarSessionId: "b", branch: "CAMPUS_A", guestBookingEnabled: false });
  const campusB = session({ seminarSessionId: "c", branch: "CAMPUS_B", guestBookingEnabled: true });
  const allScope = session({ seminarSessionId: "d", scope: "ALL", branch: null, guestBookingEnabled: false });
  const all = [campusAGuest, campusANoGuest, campusB, allScope];

  it("ENROLLED 는 캠퍼스 가시성만 본다 (ALL 회차 포함)", () => {
    const ids = sessionsForType(all, "CAMPUS_A", "ENROLLED").map((s) => s.seminarSessionId);
    assert.deepEqual(ids, ["a", "b", "d"]);
  });

  it("GUEST 는 guestBookingEnabled 회차만 본다", () => {
    const ids = sessionsForType(all, "CAMPUS_A", "GUEST").map((s) => s.seminarSessionId);
    assert.deepEqual(ids, ["a"]); // b(플래그off)·d(플래그off) 제외
  });

  it("다른 캠퍼스 BRANCH 회차는 빠진다", () => {
    const ids = sessionsForType(all, "CAMPUS_A", "GUEST").map((s) => s.seminarSessionId);
    assert.equal(ids.includes("c"), false);
  });

  it("branch·type 이 없으면 빈 배열", () => {
    assert.deepEqual(sessionsForType(all, null, "GUEST"), []);
    assert.deepEqual(sessionsForType(all, "CAMPUS_A" as Branch, null), []);
  });
});

describe("campusSessionCount", () => {
  it("GUEST 는 플래그 회차만 센다", () => {
    const list = [
      session({ branch: "CAMPUS_A", guestBookingEnabled: true }),
      session({ branch: "CAMPUS_A", guestBookingEnabled: false }),
    ];
    assert.equal(campusSessionCount(list, "CAMPUS_A", "GUEST"), 1);
    assert.equal(campusSessionCount(list, "CAMPUS_A", "ENROLLED"), 2);
  });
});

describe("isSessionBookableForType", () => {
  it("availability 가 AVAILABLE 이 아니면 불가", () => {
    assert.equal(isSessionBookableForType(session({ availability: "FULL", guestBookingEnabled: true }), "GUEST"), false);
  });

  it("GUEST 는 flag 도 필요하다", () => {
    assert.equal(isSessionBookableForType(session({ guestBookingEnabled: false }), "GUEST"), false);
    assert.equal(isSessionBookableForType(session({ guestBookingEnabled: true }), "GUEST"), true);
  });

  it("ENROLLED 는 flag 없이도 AVAILABLE 이면 가능", () => {
    assert.equal(isSessionBookableForType(session({ guestBookingEnabled: false }), "ENROLLED"), true);
  });
});

function student(
  overrides: Partial<FamilyBookingStudentSnapshot> = {},
): Pick<FamilyBookingStudentSnapshot, "participantType" | "branch"> {
  return { participantType: "ENROLLED", branch: "CAMPUS_A", ...overrides };
}

function booking(overrides: Partial<MoveSourceBooking> = {}): MoveSourceBooking {
  return { seminarSessionId: "current", students: [student()], ...overrides };
}

describe("bookingParticipantType — 스냅샷에서 유형 파생", () => {
  it("전원 GUEST 면 GUEST", () => {
    assert.equal(bookingParticipantType([student({ participantType: "GUEST" })]), "GUEST");
  });

  it("전원 ENROLLED 면 ENROLLED", () => {
    assert.equal(bookingParticipantType([student(), student()]), "ENROLLED");
  });

  it("GUEST 가 하나라도 섞이면 GUEST(방어적)", () => {
    assert.equal(bookingParticipantType([student(), student({ participantType: "GUEST" })]), "GUEST");
  });
});

describe("moveTargetSessions — 회차 이동 후보", () => {
  const guestBooking = booking({
    seminarSessionId: "current",
    students: [student({ participantType: "GUEST", branch: "CAMPUS_A" })],
  });

  it("GUEST 예약은 guestBookingEnabled=false 대상을 제외한다", () => {
    const targets = [
      session({ seminarSessionId: "off", branch: "CAMPUS_A", guestBookingEnabled: false }),
    ];
    assert.deepEqual(moveTargetSessions(targets, guestBooking), []);
  });

  it("GUEST 예약은 guestBookingEnabled=true 이고 호환되는 대상을 포함한다", () => {
    const on = session({ seminarSessionId: "on", branch: "CAMPUS_A", guestBookingEnabled: true });
    const ids = moveTargetSessions([on], guestBooking).map((s) => s.seminarSessionId);
    assert.deepEqual(ids, ["on"]);
  });

  it("ENROLLED 예약은 guestBookingEnabled=false 인 호환 대상도 포함한다(플래그 영향 없음)", () => {
    const enrolledBooking = booking({
      seminarSessionId: "current",
      students: [student({ participantType: "ENROLLED", branch: "CAMPUS_A" })],
    });
    const off = session({ seminarSessionId: "off", branch: "CAMPUS_A", guestBookingEnabled: false });
    const ids = moveTargetSessions([off], enrolledBooking).map((s) => s.seminarSessionId);
    assert.deepEqual(ids, ["off"]);
  });

  it("현재 회차·비AVAILABLE·다른 캠퍼스 대상은 유형과 무관하게 빠진다", () => {
    const targets = [
      session({ seminarSessionId: "current", branch: "CAMPUS_A", guestBookingEnabled: true }),
      session({ seminarSessionId: "full", branch: "CAMPUS_A", guestBookingEnabled: true, availability: "FULL" }),
      session({ seminarSessionId: "other", branch: "CAMPUS_B", guestBookingEnabled: true }),
      session({ seminarSessionId: "ok", branch: "CAMPUS_A", guestBookingEnabled: true }),
    ];
    const ids = moveTargetSessions(targets, guestBooking).map((s) => s.seminarSessionId);
    assert.deepEqual(ids, ["ok"]); // current(자기)·full(비AVAILABLE)·other(다른 캠퍼스) 제외
  });

  it("scope=ALL 회차는 캠퍼스가 달라도 호환으로 본다", () => {
    const allScope = session({ seminarSessionId: "all", scope: "ALL", branch: null, guestBookingEnabled: true });
    const ids = moveTargetSessions([allScope], guestBooking).map((s) => s.seminarSessionId);
    assert.deepEqual(ids, ["all"]);
  });
});

describe("manageErrorMessageForCode — 정확한 code 매핑", () => {
  it("GUEST_BOOKING_DISABLED → 비재원 예약 마감 안내", () => {
    assert.equal(manageErrorMessageForCode("GUEST_BOOKING_DISABLED"), GUEST_BOOKING_DISABLED_MESSAGE);
    assert.equal(
      manageErrorMessageForCode("GUEST_BOOKING_DISABLED"),
      "이 회차는 비재원생 예약이 닫혀 있어요. 다른 회차를 선택해 주세요.",
    );
  });

  it("매핑 없는 code 는 null(HTTP status 폴백)", () => {
    assert.equal(manageErrorMessageForCode("SOMETHING_ELSE"), null);
    assert.equal(manageErrorMessageForCode("HTTP_409"), null);
  });
});
