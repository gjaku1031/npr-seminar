import { Inject, Injectable } from "@nestjs/common";
import type { AppEnvironment } from "../../common/config/environment.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import {
  GoogleSheetsGateway,
  sheetWorkbookExpectation,
} from "./google-sheets.gateway.js";

export type SheetMappingActivationMode = "prepare" | "enable";

export class SheetMappingActivationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
  }
}

@Injectable()
export class SheetMappingActivationService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: GoogleSheetsGateway,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  public async execute(input: {
    readonly mode: SheetMappingActivationMode;
    readonly mappingId: string;
    readonly confirmedSpreadsheetId: string;
  }): Promise<{ readonly mappingId: string; readonly mode: SheetMappingActivationMode; readonly enabled: boolean }> {
    if (this.environment.processRole !== "worker") {
      throw new SheetMappingActivationError("GOOGLE_SHEETS_WORKER_ISOLATION_REQUIRED");
    }
    const mapping = await this.prisma.sheetMapping.findUnique({ where: { publicId: input.mappingId } });
    if (mapping === null) throw new SheetMappingActivationError("SHEET_MAPPING_NOT_FOUND");
    if (mapping.spreadsheetId !== input.confirmedSpreadsheetId) {
      throw new SheetMappingActivationError("GOOGLE_SHEETS_CONFIRMATION_MISMATCH");
    }
    if (input.mode === "enable" && !this.environment.googleSheetsEnabled) {
      await this.block(mapping.id, "GOOGLE_SHEETS_DISABLED");
      throw new SheetMappingActivationError("GOOGLE_SHEETS_DISABLED");
    }

    await this.prisma.sheetMapping.update({
      where: { id: mapping.id },
      data: {
        enabled: false,
        circuitStatus: "BLOCKED",
        blockReasonCode: "GOOGLE_SHEETS_VALIDATION_IN_PROGRESS",
        dispatchLeaseOwner: null,
        dispatchLeaseExpiresAt: null,
      },
    });

    const workbook = sheetWorkbookExpectation(mapping);
    const validation = input.mode === "prepare"
      ? await this.gateway.prepare(workbook)
      : await this.gateway.validate(workbook, "ACTIVATION");
    if (validation.kind !== "SUCCEEDED") {
      await this.block(mapping.id, validation.errorCode);
      throw new SheetMappingActivationError(validation.errorCode);
    }

    const validatedAt = new Date();
    const enabled = input.mode === "enable";
    await this.prisma.sheetMapping.update({
      where: { id: mapping.id },
      data: enabled ? {
        enabled: true,
        circuitStatus: "CLOSED",
        blockReasonCode: null,
        lastValidatedAt: validatedAt,
      } : {
        enabled: false,
        circuitStatus: "BLOCKED",
        blockReasonCode: "GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED",
        lastValidatedAt: validatedAt,
      },
    });
    return { mappingId: mapping.publicId, mode: input.mode, enabled };
  }

  private async block(mappingId: bigint, reason: string): Promise<void> {
    await this.prisma.sheetMapping.update({
      where: { id: mappingId },
      data: {
        enabled: false,
        circuitStatus: "BLOCKED",
        blockReasonCode: this.safeReason(reason),
        dispatchLeaseOwner: null,
        dispatchLeaseExpiresAt: null,
      },
    });
  }

  private safeReason(reason: string): string {
    return /^[A-Z0-9_]{1,80}$/.test(reason) ? reason : "GOOGLE_SHEETS_VALIDATION_FAILED";
  }
}
