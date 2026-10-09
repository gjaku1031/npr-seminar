import { describe, expect, it } from "vitest";
import { syntheticQaCheckInMetadata } from "../../src/commands/synthetic-qa-database.js";
import { CheckInsService, scannerCheckInMetadata } from "../../src/modules/check-ins/check-ins.service.js";

// 입장 이벤트의 스캐너 정보 스냅샷
describe("global check-in audit scanner snapshots", () => {
  // 실제 입장과 합성 QA 입장이 같은 스캐너 메타데이터 형식을 씀
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

  // 기기 행이 삭제되어 scannerDeviceId가 null이어도 입장 당시 표시 정보를 반환
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
