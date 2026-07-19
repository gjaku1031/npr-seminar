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
    smsSenders: { SONGPA: undefined, WIRYE: undefined, GWANGJIN: undefined },
    smsAligoTestMode: true,
    googleSheetsEnabled: enabled,
    googleSheetsSpreadsheetId: mapping.spreadsheetId,
    sessionIdleTtlSeconds: 28_800,
    sessionAbsoluteTtlSeconds: 86_400,
  };
}

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

describe("SheetMappingActivationService", () => {
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

describe("SheetAdminService readiness", () => {
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
