import { describe, expect, it, vi } from "vitest";
import type { AppEnvironment } from "../../src/common/config/environment.js";
import type { PrismaService } from "../../src/common/prisma/prisma.service.js";
import type { GoogleSheetsGateway } from "../../src/modules/google-sheets/google-sheets.gateway.js";
import {
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
} from "../../src/modules/google-sheets/google-sheets.gateway.js";
import { SheetAdminService } from "../../src/modules/google-sheets/sheet-admin.service.js";
import {
  SheetMappingActivationError,
  SheetMappingActivationService,
} from "../../src/modules/google-sheets/sheet-mapping-activation.service.js";

/**
 * 테스트 시트 매핑 행
 */
const mapping = {
  id: 1n,
  publicId: "00000000-0000-4000-8000-000000000701",
  seminarSessionPublicId: "00000000-0000-4000-8000-000000000102",
  spreadsheetId: "test-spreadsheet-identifier-0001",
  schemaFingerprint: SHEET_SCHEMA_FINGERPRINT,
  schemaVersion: SHEET_SCHEMA_VERSION,
  reservationSheetTitle: "예약명단",
  reservationSheetId: 1777564107,
};

/**
 * 워커 실행 환경
 *
 * @param enabled 시트 반영 사용 여부
 */
function environment(enabled: boolean): AppEnvironment {
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
    googleSheetsEnabled: enabled,
    googleSheetsSpreadsheetId: mapping.spreadsheetId,
    sessionIdleTtlSeconds: 28_800,
    sessionAbsoluteTtlSeconds: 86_400,
  };
}

/**
 * 지정한 검증 결과를 돌려주는 게이트웨이와 매핑 갱신 기록을 가진 활성화 서비스
 */
function activationHarness(result: { kind: "SUCCEEDED" } | { kind: "BLOCKED"; errorCode: string; openCircuit: true }) {
  const update = vi.fn().mockResolvedValue(mapping);
  const prisma = {
    sheetMapping: {
      findUnique: vi.fn().mockResolvedValue(mapping),
      update,
    },
  } as unknown as PrismaService;
  const gateway = {
    prepare: vi.fn().mockResolvedValue(result),
    validate: vi.fn().mockResolvedValue(result),
  } as unknown as GoogleSheetsGateway;
  return { prisma, gateway, update };
}

// 시트 매핑 준비·활성화
describe("SheetMappingActivationService", () => {
  // prepare는 표식 열만 준비하고 실시간 반영은 비활성으로 유지
  it("prepares markers while leaving live delivery disabled", async () => {
    const harness = activationHarness({ kind: "SUCCEEDED" });
    const service = new SheetMappingActivationService(harness.prisma, harness.gateway, environment(false));
    await expect(service.execute({
      mode: "prepare",
      mappingId: mapping.publicId,
      confirmedSpreadsheetId: mapping.spreadsheetId,
    })).resolves.toEqual({ mappingId: mapping.publicId, mode: "prepare", enabled: false });
    expect(harness.gateway.prepare).toHaveBeenCalledOnce();
    expect(harness.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      enabled: false,
      circuitStatus: "BLOCKED",
      blockReasonCode: "GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED",
      lastValidatedAt: expect.any(Date),
    }) }));
  });

  // 검증 실패 시 안전한 사유 코드를 저장하고 활성화하지 않음
  it("persists a safe provider reason and never enables on validation failure", async () => {
    const harness = activationHarness({ kind: "BLOCKED", errorCode: "WORKBOOK_LINK_WRITER_ACCESS", openCircuit: true });
    const service = new SheetMappingActivationService(harness.prisma, harness.gateway, environment(false));
    await expect(service.execute({
      mode: "prepare",
      mappingId: mapping.publicId,
      confirmedSpreadsheetId: mapping.spreadsheetId,
    })).rejects.toEqual(new SheetMappingActivationError("WORKBOOK_LINK_WRITER_ACCESS"));
    expect(harness.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      enabled: false,
      circuitStatus: "BLOCKED",
      blockReasonCode: "WORKBOOK_LINK_WRITER_ACCESS",
    }) }));
  });

  // enable은 시트 사용이 켜진 워커에서 엄격한 재검증을 통과해야 활성화
  it("enables only after a strict revalidation with the worker switch on", async () => {
    const harness = activationHarness({ kind: "SUCCEEDED" });
    const service = new SheetMappingActivationService(harness.prisma, harness.gateway, environment(true));
    await expect(service.execute({
      mode: "enable",
      mappingId: mapping.publicId,
      confirmedSpreadsheetId: mapping.spreadsheetId,
    })).resolves.toEqual({ mappingId: mapping.publicId, mode: "enable", enabled: true });
    expect(harness.gateway.validate).toHaveBeenCalledOnce();
    expect(harness.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
      enabled: true,
      circuitStatus: "CLOSED",
      blockReasonCode: null,
      lastValidatedAt: expect.any(Date),
    }) }));
  });
});

// 관리자 시트 준비 상태
describe("SheetAdminService readiness", () => {
  // 최근 워커 검증이 있으면 실시간 반영 가능으로 표시
  it("reports recent worker-backed validation as live readiness", async () => {
    const count = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(0);
    const prisma = {
      sheetMapping: { count, findFirst: vi.fn().mockResolvedValue(null) },
      sheetOutbox: { count },
    } as unknown as PrismaService;
    await expect(new SheetAdminService(prisma).readiness()).resolves.toMatchObject({
      enabled: true,
      credentialPathConfigured: true,
      adapterAvailable: true,
      liveWritesSupported: true,
      blockReasonCode: null,
      mappings: 1,
      pendingDeliveries: 2,
      blockedDeliveries: 0,
    });
  });

  // 활성 매핑이라도 최근 워커 검증이 없으면 준비 안 됨
  it("fails readiness when an enabled mapping has no recent worker validation", async () => {
    const count = vi.fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const prisma = {
      sheetMapping: { count, findFirst: vi.fn().mockResolvedValue(null) },
      sheetOutbox: { count },
    } as unknown as PrismaService;
    await expect(new SheetAdminService(prisma).readiness()).resolves.toMatchObject({
      enabled: true,
      adapterAvailable: false,
      liveWritesSupported: false,
      blockReasonCode: "GOOGLE_SHEETS_WORKER_VALIDATION_STALE",
    });
  });
});
