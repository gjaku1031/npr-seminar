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

/**
 * 시트 반영이 켜진 워커 실행 환경
 */
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
    smsSenders: { CAMPUS_A: undefined, CAMPUS_B: undefined, CAMPUS_C: undefined },
    smsAligoTestMode: true,
    googleSheetsEnabled: true,
    googleSheetsSpreadsheetId: "test-spreadsheet-identifier-0001",
    sessionIdleTtlSeconds: 28_800,
    sessionAbsoluteTtlSeconds: 86_400,
  };
}

// 매핑 정기 안전성 재검증
describe("SheetWorkerService mapping safety refresh", () => {
  // 주기 공유 검증이 실패하면 활성 매핑을 비활성·BLOCKED로 전환
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

// v4 행 값 계산
describe("SheetWorkerService v4 row projection", () => {
  // 활성 대표 수학·과학 반을 모두 나누고 시간표 접미사는 유지
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

  // 현재 대표 수강 등록이 없을 때만 예약 당시 반 사용
  it("uses the booking snapshot only when current representative assignments are unavailable", () => {
    expect(sheetStudentClassColumns([], "과고2역학SKY[일5]")).toEqual({
      mathClassNames: "",
      scienceClassNames: "과고2역학SKY[일5]",
    });
  });

  // 다른 회차로 옮긴 가족은 기존 회차 시트에서 취소로 표시
  it("projects a family moved to another session as cancelled in the old session workbook", () => {
    expect(sheetFamilyProjectionStatus("new-session", "old-session", "RESERVED")).toBe("CANCELLED");
    expect(sheetFamilyProjectionStatus("new-session", "old-session", "CHECKED_IN")).toBe("CANCELLED");
  });

  // 자기 회차 시트에서는 현재 가족 상태 유지
  it("preserves the current family status in its own session workbook", () => {
    expect(sheetFamilyProjectionStatus("same-session", "same-session", "RESERVED")).toBe("RESERVED");
    expect(sheetFamilyProjectionStatus("same-session", "same-session", "CHECKED_IN")).toBe("CHECKED_IN");
    expect(() => sheetProjectionStatus("UNKNOWN")).toThrow("SHEET_BOOKING_STATUS_INVALID");
  });

  // 예약 시점 지점 코드를 캠퍼스 이름으로 변환
  it.each([
    ["CAMPUS_A", "A"],
    ["CAMPUS_B", "B"],
    ["CAMPUS_C", "C"],
  ] as const)("maps selected.branchCodeAtBooking %s to campus %s", (branchCode, campus) => {
    expect(sheetCampus(branchCode)).toBe(campus);
  });

  // 알 수 없는 지점 코드는 SHEET_BRANCH_CODE_INVALID로 실패
  it.each([null, "", "UNKNOWN", "campusA"])("fails projection for unknown campus branch %s", (branchCode) => {
    expect(() => sheetCampus(branchCode)).toThrow("SHEET_BRANCH_CODE_INVALID");
  });

  // 비재원생의 검증 연락처 하나를 참석 보호자 열에 배치. 둘 다면 모 열
  it.each([
    ["MOTHER", { mother: "검증연락처", father: "" }],
    ["FATHER", { mother: "", father: "검증연락처" }],
    ["BOTH", { mother: "검증연락처", father: "" }],
  ] as const)("maps a %s guest's one verified contact explicitly", (party, expected) => {
    expect(guestContactColumns(party, "검증연락처")).toEqual(expected);
  });

  // 예약 상태 표시는 예약 경로와 무관하게 상태·참석 보호자로만 결정
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
