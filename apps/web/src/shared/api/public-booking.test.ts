/**
 * 공개 예약 어댑터 테스트 (node:test + tsx). 진짜 서버 없이 fetch 를 가로채 요청을 검증한다.
 *
 * 지키려는 것:
 * - ENROLLED 생성 본문에 studentIds 가 **없다**(서버가 proof 로 자동 연결).
 * - GUEST 생성 본문에 name/branch/schoolName/grade 4필드가 실린다.
 * - booking access 교환은 token 을 **본문에만** 싣고 URL/query/헤더에 싣지 않으며, 응답 CSRF 를 채택한다.
 * - 관리 세션 GET 은 X-Booking-Proof 헤더가 없고, legacy proof GET 은 있다.
 *
 * 실행: pnpm --dir apps/web test
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  cancelPublicFamilyBooking,
  createPublicFamilyBooking,
  exchangeBookingAccessToken,
  getPublicFamilyBooking,
  recoverOwnedFamilyBookingQr,
} from "./public-booking";
import { resetCsrfToken } from "./client";
import type {
  BookingAccessExchangeResult,
  FamilyBooking,
  FamilyBookingMutationResult,
  QrRecoveryResult,
} from "./contract";

const BOOKING_ID = "11111111-1111-4111-8111-111111111111";
const TOKEN = "abcDEF012345678901234567890123456789012_-XY"; // 43자

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  resetCsrfToken();
});

interface Captured {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
}

/** 요청을 붙잡으며 순서대로 응답을 내준다. /auth/csrf 는 항상 부트스트랩 토큰을 준다. */
function serve(responses: unknown[], csrfToken = "boot"): Captured[] {
  const calls: Captured[] = [];
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/auth/csrf")) {
      return new Response(JSON.stringify({ csrfToken, expiresAt: "2999-01-01T00:00:00.000Z" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
      headers: new Headers(init?.headers),
    });
    const payload = responses[index++] ?? responses[responses.length - 1];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

const booking: FamilyBooking = {
  familyBookingId: BOOKING_ID,
  seminarSessionId: "sess-1",
  contact: "01000000000",
  attendanceParty: "MOTHER",
  bookingSource: "WEB_APP",
  seatCount: 1,
  status: "RESERVED",
  students: [],
  qrStatus: "ACTIVE",
  qrVersion: 1,
  version: 1,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  checkedInAt: null,
  cancelledAt: null,
};

const mutationResult: FamilyBookingMutationResult = {
  booking,
  replayed: false,
  qrToken: TOKEN,
  qrExpiresAt: "2999-01-01T00:00:00.000Z",
};

describe("createPublicFamilyBooking — 본문 형태", () => {
  it("ENROLLED 는 studentIds 를 보내지 않는다", async () => {
    const calls = serve([mutationResult]);
    await createPublicFamilyBooking(
      { participantType: "ENROLLED", seminarSessionId: "sess-1", attendanceParty: "BOTH" },
      { bookingProof: "proof-x", idempotencyKey: "op-1" },
    );
    const body = JSON.parse(calls[0]!.body!) as Record<string, unknown>;
    assert.equal(body.participantType, "ENROLLED");
    assert.equal("studentIds" in body, false);
    // 검증된 연락처는 proof 헤더로만 온다 — 본문에 넣지 않는다.
    assert.equal("contact" in body, false);
    assert.equal(calls[0]!.headers.get("X-Booking-Proof"), "proof-x");
  });

  it("GUEST 는 name/branch/schoolName/grade 4필드를 보낸다", async () => {
    const calls = serve([mutationResult]);
    await createPublicFamilyBooking(
      {
        participantType: "GUEST",
        seminarSessionId: "sess-1",
        attendanceParty: "MOTHER",
        guest: { name: "정하윤", branch: "CAMPUS_A", schoolName: "동성중", grade: "중3" },
      },
      { bookingProof: "proof-x", idempotencyKey: "op-2" },
    );
    const body = JSON.parse(calls[0]!.body!) as { guest: Record<string, unknown> };
    assert.deepEqual(body.guest, { name: "정하윤", branch: "CAMPUS_A", schoolName: "동성중", grade: "중3" });
  });
});

describe("exchangeBookingAccessToken — 토큰 경계 + CSRF 채택", () => {
  const exchangeResult: BookingAccessExchangeResult = {
    familyBookingId: BOOKING_ID,
    expiresAt: "2999-01-01T00:00:00.000Z",
    csrfToken: "freshtoken",
  };

  it("token 을 본문에만 싣고 URL/query/헤더에 싣지 않는다", async () => {
    const calls = serve([exchangeResult]);
    await exchangeBookingAccessToken({ accessToken: TOKEN, contact: "01000000000" }, { idempotencyKey: "op-x" });

    const call = calls[0]!;
    assert.equal(call.url.endsWith("/public/booking-access/session"), true);
    assert.equal(call.url.includes(TOKEN), false);
    assert.equal(call.url.includes("?"), false);
    // 어떤 헤더에도 토큰이 새지 않는다.
    for (const [, value] of call.headers.entries()) assert.equal(value.includes(TOKEN), false);
    const body = JSON.parse(call.body!) as Record<string, unknown>;
    assert.equal(body.accessToken, TOKEN);
    assert.equal(body.contact, "01000000000");
  });

  it("응답 csrfToken 을 즉시 채택한다 — 이후 변경 요청이 새 토큰을 쓴다", async () => {
    // 교환은 booking response 를 반환하고, 이어지는 취소는 관리 세션으로 나간다.
    const calls = serve([exchangeResult, booking], "boot");
    await exchangeBookingAccessToken({ accessToken: TOKEN, contact: "01000000000" }, { idempotencyKey: "op-x2" });
    // 교환 POST 자체는 부트스트랩 토큰으로 나갔다.
    assert.equal(calls[0]!.headers.get("X-CSRF-Token"), "boot");

    await cancelPublicFamilyBooking(BOOKING_ID, 1, { session: "management", idempotencyKey: "op-cancel" });
    // 채택된 새 토큰을 쓴다(부트스트랩으로 되돌아가지 않는다).
    assert.equal(calls[1]!.headers.get("X-CSRF-Token"), "freshtoken");
    // 관리 세션 변경은 proof 헤더가 없다.
    assert.equal(calls[1]!.headers.has("X-Booking-Proof"), false);
  });
});

describe("QR 복구·조회 인증 모드", () => {
  const qrResult: QrRecoveryResult = {
    familyBookingId: BOOKING_ID,
    version: 1,
    expiresAt: "2999-01-01T00:00:00.000Z",
    qrToken: TOKEN,
  };

  it("관리 세션 GET 은 X-Booking-Proof 헤더가 없다", async () => {
    const calls = serve([qrResult]);
    await recoverOwnedFamilyBookingQr(BOOKING_ID, { session: "management" });
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.headers.has("X-Booking-Proof"), false);
    assert.equal(calls[0]!.url.endsWith(`/public/family-bookings/${BOOKING_ID}/qr`), true);
  });

  it("legacy proof GET 은 X-Booking-Proof 헤더를 싣는다", async () => {
    const calls = serve([qrResult]);
    await recoverOwnedFamilyBookingQr(BOOKING_ID, { bookingProof: "proof-y" });
    assert.equal(calls[0]!.headers.get("X-Booking-Proof"), "proof-y");
  });

  it("예약 GET 도 관리 세션 모드는 proof 헤더가 없다", async () => {
    const calls = serve([booking]);
    await getPublicFamilyBooking(BOOKING_ID, { session: "management" });
    assert.equal(calls[0]!.headers.has("X-Booking-Proof"), false);
  });
});
