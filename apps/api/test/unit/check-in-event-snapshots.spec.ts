import { describe, expect, it } from "vitest";
import { syntheticQaCheckInMetadata } from "../../src/commands/synthetic-qa-database.js";
import { CheckInsService, scannerCheckInMetadata } from "../../src/modules/check-ins/check-ins.service.js";

describe("global check-in audit scanner snapshots", () => {
  it("uses the same immutable scanner metadata shape for real and synthetic check-ins", () => {
    const scanner = {
      name: "QA iPad",
      location: "위례 입구",
      gateCode: "WIRYE-1",
      branchCode: "WIRYE" as const,
    };
    const expected = {
      scannerDeviceName: "QA iPad",
      scannerEntranceName: "위례 입구",
      scannerGateCode: "WIRYE-1",
      scannerBranchCode: "WIRYE",
    };
    expect(scannerCheckInMetadata(scanner)).toEqual(expected);
    expect(syntheticQaCheckInMetadata(scanner)).toEqual(expected);
  });

  it("returns immutable display fields when scannerDeviceId was set null", async () => {
    const occurredAt = new Date("2026-07-19T03:21:00Z");
    const prisma = {
      checkInEvent: { findMany: async () => [{
        id: 21n,
        eventId: "00000000-0000-4000-8000-000000000021",
        source: "QR",
        result: "CHECKED_IN",
        seatCount: 2,
        gateCode: "WIRYE-1",
        actorSubject: "00000000-0000-4000-8000-000000000099",
        safeMetadata: {
          scannerDeviceName: "QA iPad",
          scannerEntranceName: "위례 입구",
          scannerGateCode: "WIRYE-1",
        },
        occurredAt,
        familyBooking: { publicId: "00000000-0000-4000-8000-000000000010" },
        session: { publicId: "00000000-0000-4000-8000-000000000102" },
        scannerDevice: null,
      }] },
    };
    const service = new CheckInsService(prisma as never, {} as never, {} as never);

    const response = await service.listEvents({});
    expect(response.items).toEqual([expect.objectContaining({
      deviceId: null,
      scannerDeviceName: "QA iPad",
      scannerEntranceName: "위례 입구",
      scannerGateCode: "WIRYE-1",
    })]);
  });
});
