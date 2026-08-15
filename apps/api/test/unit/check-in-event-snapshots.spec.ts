import { describe, expect, it } from "vitest";
import { syntheticQaCheckInMetadata } from "../../src/commands/synthetic-qa-database.js";
import { CheckInsService, scannerCheckInMetadata } from "../../src/modules/check-ins/check-ins.service.js";

describe("global check-in audit scanner snapshots", () => {
  it("uses the same immutable scanner metadata shape for real and synthetic check-ins", () => {
    const scanner = {
      name: "QA iPad",
      location: "B 입구",
      gateCode: "CAMPUS_B-1",
      branchCode: "CAMPUS_B" as const,
    };
    const expected = {
      scannerDeviceName: "QA iPad",
      scannerEntranceName: "B 입구",
      scannerGateCode: "CAMPUS_B-1",
      scannerBranchCode: "CAMPUS_B",
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
        gateCode: "CAMPUS_B-1",
        actorSubject: "00000000-0000-4000-8000-000000000099",
        safeMetadata: {
          scannerDeviceName: "QA iPad",
          scannerEntranceName: "B 입구",
          scannerGateCode: "CAMPUS_B-1",
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
      scannerEntranceName: "B 입구",
      scannerGateCode: "CAMPUS_B-1",
    })]);
  });
});
