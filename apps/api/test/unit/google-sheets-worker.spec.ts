import { describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import type { PhoneProtector } from "../../src/common/crypto/phone-protector.service.js";
import type { PrismaService } from "../../src/common/prisma/prisma.service.js";
import type { GoogleSheetsGateway } from "../../src/modules/google-sheets/google-sheets.gateway.js";
import {
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";
import {
  guestContactColumns,
  sheetCampus,
  sheetFamilyProjectionStatus,
  sheetProjectionStatus,
  sheetReservationState,
  sheetStudentClassColumns,
  SheetWorkerService,
} from "../../src/modules/google-sheets/sheet-worker.service.js";

function environment(): AppEnvironment {
  return {
    appEnv: "test",
    processRole: "worker",
    port: 4000,
    trustProxy: 0,
    tongSyncEnabled: false,
    smsEnabled: false,
    smsRecipientAllowlistEnabled: true,
    smsTestRecipients: new Set(),
    smsSenders: { SONGPA: undefined, WIRYE: undefined, GWANGJIN: undefined },
    smsAligoTestMode: true,
    googleSheetsEnabled: true,
    googleSheetsSpreadsheetId: "test-spreadsheet-identifier-0001",
    sessionIdleTtlSeconds: 28_800,
    sessionAbsoluteTtlSeconds: 86_400,
  };
}

describe("SheetWorkerService mapping safety refresh", () => {
  it("disables and BLOCKS an active mapping when periodic sharing validation fails", async () => {
    const mapping = {
      id: 1n,
      spreadsheetId: "test-spreadsheet-identifier-0001",
      schemaFingerprint: SHEET_SCHEMA_FINGERPRINT,
      schemaVersion: SHEET_SCHEMA_VERSION,
      reservationSheetTitle: "예약명단",
      reservationSheetId: 1777564107,
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      sheetMapping: {
        findMany: vi.fn().mockResolvedValue([mapping]),
        updateMany,
      },
      $executeRaw: vi.fn().mockResolvedValue(0),
      $queryRaw: vi.fn().mockResolvedValue([]),
    } as unknown as PrismaService;
    const gateway = {
      validate: vi.fn().mockResolvedValue({
        kind: "BLOCKED",
        errorCode: "WORKBOOK_LINK_WRITER_ACCESS",
        openCircuit: true,
      }),
    } as unknown as GoogleSheetsGateway;
    const worker = new SheetWorkerService(
      prisma,
      {} as PhoneProtector,
      gateway,
      environment(),
    );

    await expect(worker.runOnce()).resolves.toBe(0);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: mapping.id },
      data: expect.objectContaining({
        enabled: false,
        circuitStatus: "BLOCKED",
        blockReasonCode: "WORKBOOK_LINK_WRITER_ACCESS",
      }),
    }));
  });
});

describe("SheetWorkerService v4 row projection", () => {
  it("separates every active representative math/science class without stripping schedule suffixes", () => {
    expect(sheetStudentClassColumns([
      { className: " 5ZMA ", sourceActive: true },
      { className: "과고3생2[화2]", sourceActive: true },
      { className: "과2내신[토10]", sourceActive: true },
      { className: "과2내신[토10]", sourceActive: true },
      { className: "수학특강", sourceActive: true },
      { className: "3T3A", sourceActive: false },
    ], "과학")).toEqual({
      mathClassNames: "5ZMA",
      scienceClassNames: "과2내신[토10], 과고3생2[화2]",
    });
  });

  it("uses the booking snapshot only when current representative assignments are unavailable", () => {
    expect(sheetStudentClassColumns([], "과고2역학SKY[일5]")).toEqual({
      mathClassNames: "",
      scienceClassNames: "과고2역학SKY[일5]",
    });
  });

  it("projects a family moved to another session as cancelled in the old session workbook", () => {
    expect(sheetFamilyProjectionStatus("new-session", "old-session", "RESERVED")).toBe("CANCELLED");
    expect(sheetFamilyProjectionStatus("new-session", "old-session", "CHECKED_IN")).toBe("CANCELLED");
  });

  it("preserves the current family status in its own session workbook", () => {
    expect(sheetFamilyProjectionStatus("same-session", "same-session", "RESERVED")).toBe("RESERVED");
    expect(sheetFamilyProjectionStatus("same-session", "same-session", "CHECKED_IN")).toBe("CHECKED_IN");
    expect(() => sheetProjectionStatus("UNKNOWN")).toThrow("SHEET_BOOKING_STATUS_INVALID");
  });

  it.each([
    ["SONGPA", "송파"],
    ["WIRYE", "위례"],
    ["GWANGJIN", "광진"],
  ] as const)("maps selected.branchCodeAtBooking %s to campus %s", (branchCode, campus) => {
    expect(sheetCampus(branchCode)).toBe(campus);
  });

  it.each([null, "", "UNKNOWN", "songpa"])("fails projection for unknown campus branch %s", (branchCode) => {
    expect(() => sheetCampus(branchCode)).toThrow("SHEET_BRANCH_CODE_INVALID");
  });

  it.each([
    ["MOTHER", { mother: "검증연락처", father: "" }],
    ["FATHER", { mother: "", father: "검증연락처" }],
    ["BOTH", { mother: "검증연락처", father: "" }],
  ] as const)("maps a %s guest's one verified contact explicitly", (party, expected) => {
    expect(guestContactColumns(party, "검증연락처")).toEqual(expected);
  });

  it.each([
    ["RESERVED", "MOTHER", "예약 (모) · 1명"],
    ["RESERVED", "FATHER", "예약 (부) · 1명"],
    ["RESERVED", "BOTH", "예약 (모/부) · 2명"],
    ["CHECKED_IN", "BOTH", "입장 완료 (모/부) · 2명"],
    ["CANCELLED", "MOTHER", "예약취소 (모) · 1명"],
    ["NO_SHOW", "FATHER", "미참석 (부) · 1명"],
  ] as const)("maps %s/%s without consulting bookingSource", (status, party, expected) => {
    expect(sheetReservationState(status, party)).toBe(expected);
  });
});
