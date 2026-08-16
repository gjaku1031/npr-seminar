/**
 * 공개 예약 어댑터 테스트 (node:test + tsx). 진짜 서버 없이 fetch 를 가로채 요청을 검증한다.
 *
 * 지키려는 것(계약 경계):
 * - lookup 은 정확히 `{contact}` 만 본문에 싣고 X-Booking-Proof·Idempotency-Key 를 붙이지 않으며,
 *   전체 연락처를 URL/쿼리에 노출하지 않는다. 매칭이 없으면 빈 목록이다.
 * - GET·QR 복구는 관리 세션이면 proof 헤더가 없고, proof 모드면 X-Booking-Proof 를 싣는다(마스킹 DTO).
 * - update·cancel 은 언제나 X-Booking-Proof + 안정적인 Idempotency-Key 를 싣고 마스킹 DTO 를 받는다.
 * - booking access 교환은 token 을 **본문에만** 싣고 응답 CSRF 를 채택한다.
 * - 연락처 읽기 세션(read-session)은 `{contact}` 만 본문에 싣고 CSRF·credentials·멱등키를 싣고,
 *   응답 CSRF 를 채택한 뒤 관리 세션 쿠키로 상세·QR 을 GET 하며, 변경은 언제나 proof 로만 나간다.
 * - ENROLLED 생성 본문에 studentIds/contact 가 없고, GUEST 는 4필드를 싣는다(생성 응답은 전체 예약).
 *
 * 실행: node --import tsx --test src/shared/api/public-booking.test.ts
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  cancelPublicFamilyBooking,
  createPublicFamilyBooking,
  establishFamilyBookingContactReadSession,
  exchangeBookingAccessToken,
  getPublicFamilyBooking,
  lookupPublicFamilyBookings,
  recoverOwnedFamilyBookingQr,
  updatePublicFamilyBooking,
} from "./public-booking";
import { resetCsrfToken } from "./client";
import type {
  BookingAccessExchangeResult,
  FamilyBooking,
  FamilyBookingMutationResult,
  PublicMaskedFamilyBooking,
  PublicMaskedFamilyBookingList,
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
  credentials: RequestCredentials | undefined;
}

let csrfBootstrapCount = 0;

/** 요청을 붙잡으며 순서대로 응답을 내준다. /auth/csrf 는 항상 부트스트랩 토큰을 준다. */
function serve(responses: unknown[], csrfToken = "boot"): Captured[] {
  const calls: Captured[] = [];
  let index = 0;
  csrfBootstrapCount = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/auth/csrf")) {
      csrfBootstrapCount += 1;
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
      credentials: init?.credentials,
    });
    const payload = responses[index++] ?? responses[responses.length - 1];
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return calls;
}

/** 생성 응답은 여전히 **전체** 예약을 준다(본인이 방금 만든 예약이므로). */
const booking: FamilyBooking = {
  familyBookingId: BOOKING_ID,
  seminarSessionId: "sess-1",
  contact: "01000000000",
  attendanceParty: "MOTHER",
  bookingSource: "WEB_APP",
  seatCount: 1,
  attendedCount: null,
  isTest: false,
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

/** 조회·상세·변경·취소 경로가 다루는 **마스킹** DTO. */
const maskedBooking: PublicMaskedFamilyBooking = {
  familyBookingId: BOOKING_ID,
  seminarSessionId: "sess-1",
  maskedContact: "010-****-0000",
  attendanceParty: "MOTHER",
  bookingSource: "WEB_APP",
  seatCount: 1,
  status: "RESERVED",
  participants: [{ participantType: "ENROLLED", maskedName: "홍*동", branch: "CAMPUS_A" }],
  qrStatus: "ACTIVE",
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

const qrResult: QrRecoveryResult = {
  familyBookingId: BOOKING_ID,
  version: 1,
  expiresAt: "2999-01-01T00:00:00.000Z",
  qrToken: TOKEN,
};

describe("lookupPublicFamilyBookings — 연락처 조회 본문·헤더 경계", () => {
  it("정확히 {contact} 만 본문에 싣고 proof·멱등키를 붙이지 않는다", async () => {
    const list: PublicMaskedFamilyBookingList = { items: [maskedBooking] };
    const calls = serve([list]);
    const result = await lookupPublicFamilyBookings("01000000000");

    const call = calls[0]!;
    assert.equal(call.method, "POST");
    assert.equal(call.url.endsWith("/public/family-bookings/lookup"), true);
    // 전체 연락처가 URL·쿼리에 새지 않는다(그래서 GET 이 아니라 POST 본문이다).
    assert.equal(call.url.includes("01000000000"), false);
    assert.equal(call.url.includes("?"), false);
    const body = JSON.parse(call.body!) as Record<string, unknown>;
    assert.deepEqual(body, { contact: "01000000000" });
    assert.equal(call.credentials, "omit");
    assert.equal(csrfBootstrapCount, 0);
    assert.equal(call.headers.has("X-CSRF-Token"), false);
    assert.equal(call.headers.has("X-Booking-Proof"), false);
    assert.equal(call.headers.has("Idempotency-Key"), false);
    // 마스킹 목록을 그대로 돌려준다.
    assert.equal(result.items[0]!.participants[0]!.maskedName, "홍*동");
    assert.equal(result.items[0]!.maskedContact, "010-****-0000");
  });

  it("매칭이 없으면 빈 목록을 그대로 돌려준다", async () => {
    serve([{ items: [] }]);
    const result = await lookupPublicFamilyBookings("01000000000");
    assert.deepEqual(result.items, []);
  });
});

describe("getPublicFamilyBooking · QR 복구 — 읽기 인증 모드(마스킹 DTO)", () => {
  it("관리 세션 GET 은 X-Booking-Proof 헤더가 없다", async () => {
    const calls = serve([maskedBooking]);
    const result = await getPublicFamilyBooking(BOOKING_ID, { session: "management" });
    assert.equal(calls[0]!.method, "GET");
    assert.equal(calls[0]!.headers.has("X-Booking-Proof"), false);
    // 결과가 마스킹 DTO 다(마스킹 참가자·연락처).
    assert.equal(result.participants[0]!.maskedName, "홍*동");
    assert.equal(result.maskedContact, "010-****-0000");
  });

  it("proof GET 은 X-Booking-Proof 헤더를 싣는다", async () => {
    const calls = serve([maskedBooking]);
    await getPublicFamilyBooking(BOOKING_ID, { bookingProof: "proof-g" });
    assert.equal(calls[0]!.headers.get("X-Booking-Proof"), "proof-g");
  });

  it("관리 세션 QR 복구는 proof 헤더가 없다", async () => {
    const calls = serve([qrResult]);
    await recoverOwnedFamilyBookingQr(BOOKING_ID, { session: "management" });
    assert.equal(calls[0]!.headers.has("X-Booking-Proof"), false);
    assert.equal(calls[0]!.url.endsWith(`/public/family-bookings/${BOOKING_ID}/qr`), true);
  });

  it("proof QR 복구는 X-Booking-Proof 헤더를 싣는다", async () => {
    const calls = serve([qrResult]);
    await recoverOwnedFamilyBookingQr(BOOKING_ID, { bookingProof: "proof-y" });
    assert.equal(calls[0]!.headers.get("X-Booking-Proof"), "proof-y");
  });
});

describe("updatePublicFamilyBooking · cancelPublicFamilyBooking — 언제나 proof + 멱등키", () => {
  it("update 는 X-Booking-Proof 와 넘긴 Idempotency-Key 를 그대로 싣고 마스킹 DTO 를 받는다", async () => {
    const calls = serve([{ ...maskedBooking, attendanceParty: "BOTH", seatCount: 2, version: 2 }]);
    const result = await updatePublicFamilyBooking(
      BOOKING_ID,
      { attendanceParty: "BOTH", expectedVersion: 1 },
      { bookingProof: "proof-u", idempotencyKey: "op-u" },
    );

    const call = calls[0]!;
    assert.equal(call.method, "PATCH");
    assert.equal(call.url.endsWith(`/public/family-bookings/${BOOKING_ID}`), true);
    assert.equal(call.headers.get("X-Booking-Proof"), "proof-u");
    assert.equal(call.headers.get("Idempotency-Key"), "op-u");
    // 공개 자기관리 본문에는 학생 변경 필드가 없다(회차/참석 + expectedVersion 만).
    const body = JSON.parse(call.body!) as Record<string, unknown>;
    assert.deepEqual(body, { attendanceParty: "BOTH", expectedVersion: 1 });
    // 결과가 마스킹 DTO 다.
    assert.equal(result.participants[0]!.maskedName, "홍*동");
    assert.equal(result.maskedContact, "010-****-0000");
  });

  it("cancel 은 X-Booking-Proof 와 Idempotency-Key 를 싣고 expectedVersion 만 본문에 담는다", async () => {
    const calls = serve([{ ...maskedBooking, status: "CANCELLED", cancelledAt: "2026-07-16T00:00:00.000Z" }]);
    const result = await cancelPublicFamilyBooking(BOOKING_ID, 3, { bookingProof: "proof-c", idempotencyKey: "op-c" });

    const call = calls[0]!;
    assert.equal(call.method, "POST");
    assert.equal(call.url.endsWith(`/public/family-bookings/${BOOKING_ID}/cancel`), true);
    assert.equal(call.headers.get("X-Booking-Proof"), "proof-c");
    assert.equal(call.headers.get("Idempotency-Key"), "op-c");
    const body = JSON.parse(call.body!) as Record<string, unknown>;
    assert.deepEqual(body, { expectedVersion: 3 });
    assert.equal(result.status, "CANCELLED");
  });
});

describe("createPublicFamilyBooking — 본문 형태(생성 응답은 전체 예약)", () => {
  it("ENROLLED 는 studentIds·contact 를 보내지 않고 proof 헤더를 싣는다", async () => {
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

  it("응답 csrfToken 을 즉시 채택한다 — 이어지는 변경(proof)이 새 토큰을 쓴다", async () => {
    // 교환은 booking response 를 반환하고, 이어지는 취소는 **새 proof** 로 나간다(세션은 변경 인증 불가).
    const calls = serve([exchangeResult, { ...maskedBooking, status: "CANCELLED" }], "boot");
    await exchangeBookingAccessToken({ accessToken: TOKEN, contact: "01000000000" }, { idempotencyKey: "op-x2" });
    // 교환 POST 자체는 부트스트랩 토큰으로 나갔다.
    assert.equal(calls[0]!.headers.get("X-CSRF-Token"), "boot");

    await cancelPublicFamilyBooking(BOOKING_ID, 1, { bookingProof: "proof-c", idempotencyKey: "op-cancel" });
    // 채택된 새 토큰을 쓴다(부트스트랩으로 되돌아가지 않는다).
    assert.equal(calls[1]!.headers.get("X-CSRF-Token"), "freshtoken");
    // 변경은 언제나 proof 를 싣는다.
    assert.equal(calls[1]!.headers.get("X-Booking-Proof"), "proof-c");
  });
});

describe("establishFamilyBookingContactReadSession — 연락처 읽기 세션 경계 + CSRF 채택", () => {
  const readSessionResult: BookingAccessExchangeResult = {
    familyBookingId: BOOKING_ID,
    expiresAt: "2999-01-01T00:00:00.000Z",
    csrfToken: "freshtoken",
  };

  it("정확히 {contact} 만 본문에 싣고 CSRF·credentials·Idempotency-Key 를 싣는다(proof 없음)", async () => {
    const calls = serve([readSessionResult]);
    const result = await establishFamilyBookingContactReadSession(BOOKING_ID, "01000000000", {
      idempotencyKey: "op-read",
    });

    const call = calls[0]!;
    assert.equal(call.method, "POST");
    assert.equal(call.url.endsWith(`/public/family-bookings/${BOOKING_ID}/read-session`), true);
    // 전체 연락처가 URL·쿼리에 새지 않는다(그래서 GET 이 아니라 POST 본문이다).
    assert.equal(call.url.includes("01000000000"), false);
    assert.equal(call.url.includes("?"), false);
    const body = JSON.parse(call.body!) as Record<string, unknown>;
    assert.deepEqual(body, { contact: "01000000000" });
    // 상태 변경(durable) 이라 lookup 과 달리 CSRF·세션 쿠키·멱등키를 싣는다.
    assert.equal(call.credentials, "include");
    assert.equal(call.headers.get("X-CSRF-Token"), "boot");
    assert.equal(call.headers.get("Idempotency-Key"), "op-read");
    assert.equal(csrfBootstrapCount, 1);
    // 읽기 세션 수립 자체는 proof 를 쓰지 않는다.
    assert.equal(call.headers.has("X-Booking-Proof"), false);
    assert.equal(result.familyBookingId, BOOKING_ID);
  });

  it("응답 csrfToken 채택 → 관리 세션 쿠키로 상세·QR 을 GET(proof 없음), 변경은 새 proof+새 CSRF", async () => {
    const calls = serve(
      [
        readSessionResult,
        maskedBooking,
        qrResult,
        { ...maskedBooking, attendanceParty: "BOTH", seatCount: 2, version: 2 },
      ],
      "boot",
    );

    // 1) 읽기 세션 수립 — 부트스트랩 CSRF 로 나간다.
    await establishFamilyBookingContactReadSession(BOOKING_ID, "01000000000", { idempotencyKey: "op-read2" });
    assert.equal(calls[0]!.headers.get("X-CSRF-Token"), "boot");

    // 2) 같은 마스킹 상세 GET — 관리 세션 쿠키만 쓰고 proof 헤더가 없다.
    const detail = await getPublicFamilyBooking(BOOKING_ID, { session: "management" });
    assert.equal(calls[1]!.method, "GET");
    assert.equal(calls[1]!.url.endsWith(`/public/family-bookings/${BOOKING_ID}`), true);
    assert.equal(calls[1]!.headers.has("X-Booking-Proof"), false);
    assert.equal(calls[1]!.credentials, "include");
    assert.equal(detail.maskedContact, "010-****-0000");

    // 3) 현재 QR 복구 GET — 마찬가지로 proof 없이 쿠키 세션만 쓴다.
    await recoverOwnedFamilyBookingQr(BOOKING_ID, { session: "management" });
    assert.equal(calls[2]!.method, "GET");
    assert.equal(calls[2]!.url.endsWith(`/public/family-bookings/${BOOKING_ID}/qr`), true);
    assert.equal(calls[2]!.headers.has("X-Booking-Proof"), false);

    // 4) 변경은 세션으로 인증하지 않는다 — 언제나 새 proof + 채택된 새 CSRF 를 싣는다.
    await updatePublicFamilyBooking(
      BOOKING_ID,
      { attendanceParty: "BOTH", expectedVersion: 1 },
      { bookingProof: "proof-m", idempotencyKey: "op-mutate" },
    );
    assert.equal(calls[3]!.method, "PATCH");
    assert.equal(calls[3]!.headers.get("X-Booking-Proof"), "proof-m");
    // 채택된 새 토큰을 쓴다(부트스트랩으로 되돌아가지 않는다) → 추가 부트스트랩이 없다.
    assert.equal(calls[3]!.headers.get("X-CSRF-Token"), "freshtoken");
    assert.equal(csrfBootstrapCount, 1);
  });
});
