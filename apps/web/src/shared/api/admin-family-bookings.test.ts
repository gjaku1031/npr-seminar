/**
 * 가족 예약 이력 수집 테스트 (node:test + tsx).
 *
 * 여기서 지키려는 것 하나: **이력을 끝까지 읽는가.**
 *
 * 이 엔드포인트는 sequence 오름차순 + `afterSequence` 커서다. 첫 페이지만 읽으면 손에 남는 건
 * *가장 오래된* 기록이고 최신 기록은 통째로 빠진다 — 그런데도 "최근 것만 보여 준다"고 말하면
 * 사실과 정반대다. 그래서 두 번째 페이지가 **서버가 준 커서로** 실제로 요청되는지, 그리고
 * 마지막 이벤트가 결과에 들어오는지 본다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  BOOKING_EVENT_PAGE_LIMIT_MAX,
  cancelAdminFamilyBooking,
  collectFamilyBookingEvents,
  createAdminEnrolledFamilyBooking,
  createAdminGuestFamilyBooking,
  getAdminFamilyBooking,
} from "./admin-family-bookings";
import type {
  BookingAuditEvent,
  BookingAuditEventPage,
  FamilyBooking,
  FamilyBookingMutationResult,
} from "./contract";
import { isAborted } from "./problem";

const BOOKING_ID = "22222222-2222-4222-8222-222222222222";

const event = (id: string, sequence: string): BookingAuditEvent => ({
  eventId: id,
  sequence,
  familyBookingId: BOOKING_ID,
  type: "CREATED",
  actor: { type: "ADMIN", subjectId: null, displayName: "관리자" },
  reason: null,
  cancellationType: null,
  metadata: {},
  occurredAt: "2026-07-15T02:00:00.000Z",
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** 페이지들을 차례로 내주면서 요청 URL 을 붙잡는다 — 진짜 서버는 없다. */
function serve(pages: BookingAuditEventPage[]): { urls: string[] } {
  const urls: string[] = [];
  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === "string" ? input : input.toString());
    const page = pages[call++] ?? pages[pages.length - 1]!;
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { urls };
}

const query = (raw: string) => new URL(raw, "https://example.test").searchParams;

describe("collectFamilyBookingEvents — 이력 전부", () => {
  it("hasMore 면 서버가 준 afterSequence 로 다음 장을 부르고, 최신 이벤트까지 담는다", async () => {
    const captured = serve([
      { items: [event("e1", "10"), event("e2", "20")], page: { nextAfterSequence: "20", hasMore: true } },
      { items: [event("e3", "30")], page: { nextAfterSequence: null, hasMore: false } },
    ]);

    const events = await collectFamilyBookingEvents(BOOKING_ID);

    assert.equal(captured.urls.length, 2);
    // 첫 장은 커서 없이 — 서버 기본값('0')부터다.
    assert.equal(query(captured.urls[0]!).has("afterSequence"), false);
    // 두 번째 장은 **첫 장이 돌려준 커서 그대로**. 이게 빠지면 같은 첫 장만 되풀이한다.
    assert.equal(query(captured.urls[1]!).get("afterSequence"), "20");
    // 계약 최대치로 읽어 왕복을 줄인다.
    assert.equal(query(captured.urls[0]!).get("limit"), String(BOOKING_EVENT_PAGE_LIMIT_MAX));

    // 첫 장만 읽었다면 e3(가장 최신)이 없다 — 그게 정확히 이 테스트가 막는 회귀다.
    assert.deepEqual(
      events.map((e) => e.eventId),
      ["e1", "e2", "e3"],
    );
  });

  it("한 장으로 끝나면 한 번만 부른다", async () => {
    const captured = serve([{ items: [event("e1", "10")], page: { nextAfterSequence: null, hasMore: false } }]);

    const events = await collectFamilyBookingEvents(BOOKING_ID);

    assert.equal(captured.urls.length, 1);
    assert.deepEqual(events.map((e) => e.eventId), ["e1"]);
  });

  it("세 장 이상도 커서를 이어 따라간다", async () => {
    const captured = serve([
      { items: [event("e1", "10")], page: { nextAfterSequence: "10", hasMore: true } },
      { items: [event("e2", "20")], page: { nextAfterSequence: "20", hasMore: true } },
      { items: [event("e3", "30")], page: { nextAfterSequence: null, hasMore: false } },
    ]);

    const events = await collectFamilyBookingEvents(BOOKING_ID);

    assert.deepEqual(captured.urls.map((u) => query(u).get("afterSequence")), [null, "10", "20"]);
    assert.deepEqual(events.map((e) => e.eventId), ["e1", "e2", "e3"]);
  });

  it("hasMore 인데 커서가 없으면 잘린 목록을 전부인 척하지 않고 던진다", async () => {
    serve([{ items: [event("e1", "10")], page: { nextAfterSequence: null, hasMore: true } }]);

    await assert.rejects(() => collectFamilyBookingEvents(BOOKING_ID), /끝까지 읽지 못했어요/);
  });

  it("커서가 제자리면 무한 루프 대신 던진다", async () => {
    serve([
      { items: [event("e1", "10")], page: { nextAfterSequence: "10", hasMore: true } },
      { items: [event("e1", "10")], page: { nextAfterSequence: "10", hasMore: true } },
    ]);

    await assert.rejects(() => collectFamilyBookingEvents(BOOKING_ID), /끝까지 읽지 못했어요/);
  });

  it("커서가 유효한 10진수 sequence 가 아니면(첫 커서 포함) 던진다", async () => {
    // 첫 장이 곧장 망가진 커서를 줘도 잘린 목록을 전부인 척하지 않는다.
    serve([{ items: [event("e1", "10")], page: { nextAfterSequence: "20-bad", hasMore: true } }]);

    await assert.rejects(() => collectFamilyBookingEvents(BOOKING_ID), /끝까지 읽지 못했어요/);
  });

  it("커서가 거꾸로 가면(순환 20→10→20 포함) 던진다", async () => {
    // 직전 값하고만 비교하면(20→10 은 다르니 통과) 20↔10 을 영원히 오간다. 엄격히 커야 막힌다.
    serve([
      { items: [event("e1", "10")], page: { nextAfterSequence: "20", hasMore: true } },
      { items: [event("e2", "20")], page: { nextAfterSequence: "10", hasMore: true } },
      { items: [event("e3", "30")], page: { nextAfterSequence: "20", hasMore: true } },
    ]);

    await assert.rejects(() => collectFamilyBookingEvents(BOOKING_ID), /끝까지 읽지 못했어요/);
  });

  it("Number 로 좁히면 같아 보이는 큰 커서도 BigInt 로는 나아가 끝까지 읽는다", async () => {
    // 9007199254740993 은 Number 로 바꾸면 992 로 반올림돼 직전 992 와 같아 보인다 —
    // 그러면 진짜 진전을 "제자리"로 오해해 이력을 잘라 버린다. BigInt 비교라야 나아간다.
    serve([
      { items: [event("e1", "1")], page: { nextAfterSequence: "9007199254740992", hasMore: true } },
      { items: [event("e2", "2")], page: { nextAfterSequence: "9007199254740993", hasMore: true } },
      { items: [event("e3", "3")], page: { nextAfterSequence: null, hasMore: false } },
    ]);

    const events = await collectFamilyBookingEvents(BOOKING_ID);
    assert.deepEqual(
      events.map((e) => e.eventId),
      ["e1", "e2", "e3"],
    );
  });

  it("장 사이에 취소되면 남은 장을 부르지 않고 AbortError 로 끝난다", async () => {
    const controller = new AbortController();
    const captured = serve([
      { items: [event("e1", "10")], page: { nextAfterSequence: "10", hasMore: true } },
      { items: [event("e2", "20")], page: { nextAfterSequence: null, hasMore: false } },
    ]);
    // 첫 장을 내주자마자 끊는다 — 모달을 닫은 상황이다.
    const serveOne = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const response = await serveOne(input, init);
      controller.abort();
      return response;
    }) as typeof fetch;

    await assert.rejects(() => collectFamilyBookingEvents(BOOKING_ID, controller.signal), (caught: unknown) =>
      isAborted(caught),
    );
    // 두 번째 장을 부르지 않았다 — 훅은 이걸 조용히 무시한다(빈 오류를 그리지 않는다).
    assert.equal(captured.urls.length, 1);
  });
});

describe("getAdminFamilyBooking — 취소된 집계 한 건", () => {
  const booking: FamilyBooking = {
    familyBookingId: BOOKING_ID,
    seminarSessionId: "11111111-1111-4111-8111-111111111111",
    contact: "01000000000",
    attendanceParty: "MOTHER",
    bookingSource: "PHONE",
    seatCount: 1,
    status: "CANCELLED",
    students: [],
    qrStatus: "REVOKED",
    qrVersion: 1,
    version: 2,
    createdAt: "2026-07-15T02:00:00.000Z",
    updatedAt: "2026-07-15T03:00:00.000Z",
    checkedInAt: null,
    cancelledAt: "2026-07-15T03:00:00.000Z",
  };

  it("이벤트 접미사 없이 그 집계 경로 하나만 GET 한다 (행마다 부르지 않으려는 트리거)", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify(booking), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const result = await getAdminFamilyBooking(BOOKING_ID);

    assert.equal(urls.length, 1);
    const path = new URL(urls[0]!, "https://example.test").pathname;
    assert.ok(path.endsWith(`/admin/family-bookings/${BOOKING_ID}`));
    assert.ok(!path.endsWith("/events"));
    assert.equal(result.status, "CANCELLED");
  });
});

describe("cancelAdminFamilyBooking — 취소 본문은 정확히 {expectedVersion, cancellationType}", () => {
  const booking: FamilyBooking = {
    familyBookingId: BOOKING_ID,
    seminarSessionId: "11111111-1111-4111-8111-111111111111",
    contact: "01000000000",
    attendanceParty: "MOTHER",
    bookingSource: "PHONE",
    seatCount: 1,
    status: "CANCELLED",
    students: [],
    qrStatus: "REVOKED",
    qrVersion: 1,
    version: 8,
    createdAt: "2026-07-15T02:00:00.000Z",
    updatedAt: "2026-07-15T03:00:00.000Z",
    checkedInAt: null,
    cancelledAt: "2026-07-15T03:00:00.000Z",
  };

  /** CSRF 부트스트랩과 취소 POST 를 함께 처리하면서 POST 본문을 붙잡는다. */
  function serveCancel(): { bodies: string[] } {
    const bodies: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "t", expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (typeof init?.body === "string") bodies.push(init.body);
      return new Response(JSON.stringify(booking), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    return { bodies };
  }

  it("expectedVersion·cancellationType 만 담고 reason 은 키 자체가 없다", async () => {
    const captured = serveCancel();

    await cancelAdminFamilyBooking(
      { familyBookingId: BOOKING_ID, expectedVersion: 7, cancellationType: "TEACHER" },
      { idempotencyKey: "op-1" },
    );

    assert.equal(captured.bodies.length, 1);
    const parsed = JSON.parse(captured.bodies[0]!) as Record<string, unknown>;
    // 본문은 정확히 이 두 키다 — 자유 사유는 실리지 않는다.
    assert.deepEqual(parsed, { expectedVersion: 7, cancellationType: "TEACHER" });
    // undefined 로 담긴 것도 아니고, 키 자체가 없어야 한다.
    assert.equal("reason" in parsed, false);
  });
});

describe("가족 예약 생성 — reason 은 선택이라 없으면 본문에서 뺀다", () => {
  const SESSION_ID = "11111111-1111-4111-8111-111111111111";

  const result: FamilyBookingMutationResult = {
    replayed: true,
    booking: {
      familyBookingId: BOOKING_ID,
      seminarSessionId: SESSION_ID,
      contact: "01000000000",
      attendanceParty: "MOTHER",
      bookingSource: "PHONE",
      seatCount: 1,
      status: "RESERVED",
      students: [],
      qrStatus: "ACTIVE",
      qrVersion: 1,
      version: 1,
      createdAt: "2026-07-15T02:00:00.000Z",
      updatedAt: "2026-07-15T02:00:00.000Z",
      checkedInAt: null,
      cancelledAt: null,
    },
  };

  /** CSRF 부트스트랩과 생성 POST 를 함께 처리하면서 POST 본문을 붙잡는다. */
  function serveCreate(): { bodies: string[] } {
    const bodies: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/csrf")) {
        return new Response(JSON.stringify({ csrfToken: "t", expiresAt: "2999-01-01T00:00:00.000Z" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (typeof init?.body === "string") bodies.push(init.body);
      return new Response(JSON.stringify(result), { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { bodies };
  }

  it("비재원생 생성 — reason 을 안 주면 키 자체가 없다 (지어낸 값을 채우지 않는다)", async () => {
    const captured = serveCreate();

    await createAdminGuestFamilyBooking(
      {
        seminarSessionId: SESSION_ID,
        contact: "01000000000",
        attendanceParty: "MOTHER",
        bookingSource: "PHONE",
        guest: { name: "홍길동", branch: "SONGPA", schoolName: "동성중", grade: "중3" },
      },
      { idempotencyKey: "op-guest" },
    );

    const parsed = JSON.parse(captured.bodies[0]!) as Record<string, unknown>;
    assert.equal(parsed.participantType, "GUEST");
    assert.equal("reason" in parsed, false);
  });

  it("재원생 생성 — reason 을 안 주면 키 자체가 없다", async () => {
    const captured = serveCreate();

    await createAdminEnrolledFamilyBooking(
      {
        seminarSessionId: SESSION_ID,
        contact: "01000000000",
        attendanceParty: "BOTH",
        bookingSource: "TEACHER",
        studentIds: ["s-1", "s-2"],
      },
      { idempotencyKey: "op-enrolled" },
    );

    const parsed = JSON.parse(captured.bodies[0]!) as Record<string, unknown>;
    assert.equal(parsed.participantType, "ENROLLED");
    assert.deepEqual(parsed.studentIds, ["s-1", "s-2"]);
    assert.equal("reason" in parsed, false);
  });

  it("빈·공백 reason 도 키를 넣지 않는다", async () => {
    const captured = serveCreate();

    await createAdminGuestFamilyBooking(
      {
        seminarSessionId: SESSION_ID,
        contact: "01000000000",
        attendanceParty: "MOTHER",
        bookingSource: "ON_SITE",
        guest: { name: "홍길동", branch: "SONGPA", schoolName: "동성중", grade: "중3" },
        reason: "   ",
      },
      { idempotencyKey: "op-guest-2" },
    );

    assert.equal("reason" in (JSON.parse(captured.bodies[0]!) as Record<string, unknown>), false);
  });

  it("reason 을 주면 트림해서 싣는다 — 선택적으로 남길 수는 있다", async () => {
    const captured = serveCreate();

    await createAdminEnrolledFamilyBooking(
      {
        seminarSessionId: SESSION_ID,
        contact: "01000000000",
        attendanceParty: "MOTHER",
        bookingSource: "PHONE",
        studentIds: ["s-1"],
        reason: "  전화 요청  ",
      },
      { idempotencyKey: "op-enrolled-2" },
    );

    assert.equal((JSON.parse(captured.bodies[0]!) as Record<string, unknown>).reason, "전화 요청");
  });
});
