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
      guestBookingEnabled: false,
      status: "OPEN",
      version: 1n,
      createdAt: now,
      updatedAt: now,
    });
    const sessions = [
      session(11n, "00000000-0000-4000-8000-000000000111"),
      session(12n, "00000000-0000-4000-8000-000000000112"),
    ];
    const groupBy = vi.fn(async () => [
      { sessionId: 11n, status: "RESERVED", attendanceParty: "BOTH", _count: { _all: 2 }, _sum: { attendedCount: null } },
      { sessionId: 11n, status: "CHECKED_IN", attendanceParty: "MOTHER", _count: { _all: 1 }, _sum: { attendedCount: 1 } },
      // ★ 2명 예약 2건이 입장했는데 실제로는 3명만 왔다 — 한 가족은 한 분만 온 경우다.
      //   예상 참석(attendeeCount)은 4를 더하지만 실제 입장은 3이어야 한다.
      { sessionId: 11n, status: "CHECKED_IN", attendanceParty: "BOTH", _count: { _all: 2 }, _sum: { attendedCount: 3 } },
      { sessionId: 11n, status: "CANCELLED", attendanceParty: "BOTH", _count: { _all: 3 }, _sum: { attendedCount: null } },
      { sessionId: 11n, status: "NO_SHOW", attendanceParty: "MOTHER", _count: { _all: 4 }, _sum: { attendedCount: null } },
    ]);
    const service = new SeminarsService({
      seminar: { count: vi.fn(async () => 1) },
      seminarSession: { findMany: vi.fn(async () => sessions) },
      familyBooking: { groupBy },
    } as never, {} as never);

    const response = await service.listSessions("00000000-0000-4000-8000-000000000100");

    expect(groupBy).toHaveBeenCalledTimes(1);
    expect(groupBy).toHaveBeenCalledWith({
      by: ["sessionId", "status", "attendanceParty"],
      where: { sessionId: { in: [11n, 12n] } },
      _count: { _all: true },
      _sum: { attendedCount: true },
    });
    expect(response.items[0]).toMatchObject({
      operationsSummary: {
        activeBookingCount: 5,
        checkedInBookingCount: 3,
        uncheckedBookingCount: 2,
        cancelledBookingCount: 3,
        noShowBookingCount: 4,
        // 예상 참석: RESERVED BOTH 2건(4) + CHECKED_IN MOTHER 1건(1) + CHECKED_IN BOTH 2건(4)
        attendeeCount: 9,
        // 실제 입장: 게이트가 확정한 값의 합(1 + 3). 예상(위)에서 파생하지 않는다.
        attendedPeopleCount: 4,
      },
    });
    expect(response.items[1]!.operationsSummary).toEqual({
      activeBookingCount: 0,
      checkedInBookingCount: 0,
      uncheckedBookingCount: 0,
      cancelledBookingCount: 0,
      noShowBookingCount: 0,
      attendeeCount: 0,
      attendedPeopleCount: 0,
    });
    expect(response.page).toEqual({ page: 1, pageSize: 2, totalItems: 2, totalPages: 1 });
  });

  it("keeps public booking availability governed by status and booking window only", async () => {
    const now = new Date();
    const service = new SeminarsService({
      seminarSession: {
        findMany: vi.fn(async () => [{
          id: 11n,
          publicId: "00000000-0000-4000-8000-000000000111",
          seminar: {
            publicId: "00000000-0000-4000-8000-000000000100",
            title: "2026 대학교 입시 설명회",
          },
          scope: "ALL",
          branch: null,
          startsAt: new Date(now.getTime() + 3_600_000),
          endsAt: new Date(now.getTime() + 7_200_000),
          place: "서울시 교통회관 (올림픽로 319)",
          bookingOpensAt: new Date(now.getTime() - 3_600_000),
          bookingClosesAt: new Date(now.getTime() + 1_800_000),
          guestBookingEnabled: false,
        }]),
      },
    } as never, {} as never);

    const response = await service.listPublic();

    expect(response.items[0]).toEqual(expect.objectContaining({
      location: "서울시 교통회관 (올림픽로 319)",
      availability: "AVAILABLE",
    }));
    expect(response.items[0]).not.toHaveProperty("capacity");
    expect(response.items[0]).not.toHaveProperty("remainingCapacity");
  });
});
