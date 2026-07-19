import { describe, expect, it, vi } from "vitest";
import { SeminarsService } from "../../src/modules/seminars/seminars.service.js";

describe("admin seminar session list", () => {
  it("adds family-booking operations summaries with one batched status aggregation", async () => {
    const now = new Date("2026-07-18T00:00:00Z");
    const session = (id: bigint, publicId: string) => ({
      id,
      publicId,
      seminar: { publicId: "00000000-0000-4000-8000-000000000100" },
      scope: "ALL",
      branch: null,
      startsAt: now,
      endsAt: new Date(now.getTime() + 3_600_000),
      place: "세미나실",
      bookingOpensAt: now,
      bookingClosesAt: new Date(now.getTime() + 1_800_000),
      status: "OPEN",
      version: 1n,
      createdAt: now,
      updatedAt: now,
      capacity: { capacity: 100, reservedCount: 17, checkedInCount: 8, version: 2n },
    });
    const sessions = [
      session(11n, "00000000-0000-4000-8000-000000000111"),
      session(12n, "00000000-0000-4000-8000-000000000112"),
    ];
    const groupBy = vi.fn(async () => [
      { sessionId: 11n, status: "RESERVED", _count: { _all: 2 } },
      { sessionId: 11n, status: "CHECKED_IN", _count: { _all: 1 } },
      { sessionId: 11n, status: "CANCELLED", _count: { _all: 3 } },
      { sessionId: 11n, status: "NO_SHOW", _count: { _all: 4 } },
    ]);
    const service = new SeminarsService({
      seminar: { count: vi.fn(async () => 1) },
      seminarSession: { findMany: vi.fn(async () => sessions) },
      familyBooking: { groupBy },
    } as never, {} as never);

    const response = await service.listSessions("00000000-0000-4000-8000-000000000100");

    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ["sessionId", "status"],
      where: { sessionId: { in: [11n, 12n] } },
      _count: { _all: true },
    });
    expect(response.items[0]).toMatchObject({
      capacity: { capacity: 100, reservedCount: 17, checkedInCount: 8 },
      operationsSummary: {
        activeBookingCount: 3,
        checkedInBookingCount: 1,
        uncheckedBookingCount: 2,
        cancelledBookingCount: 3,
        noShowBookingCount: 4,
      },
    });
    expect(response.items[1]!.operationsSummary).toEqual({
      activeBookingCount: 0,
      checkedInBookingCount: 0,
      uncheckedBookingCount: 0,
      cancelledBookingCount: 0,
      noShowBookingCount: 0,
    });
    expect(response.page).toEqual({ page: 1, pageSize: 2, totalItems: 2, totalPages: 1 });
  });
});
