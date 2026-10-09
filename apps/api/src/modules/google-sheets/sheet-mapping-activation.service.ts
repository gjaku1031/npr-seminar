import { Inject, Injectable } from "@nestjs/common";
import type { AppEnvironment } from "../../common/config/environment.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import {
  GoogleSheetsGateway,
  sheetWorkbookExpectation,
} from "./google-sheets.gateway.js";

/**
 * 매핑 활성화 모드. prepare는 시트 구조 준비·검증만, enable은 검증 후 실시간 반영 활성화
 */
export type SheetMappingActivationMode = "prepare" | "enable";

/**
 * 매핑 활성화 실패. 오류 코드만 담아 운영 명령 출력으로 전달
 */
export class SheetMappingActivationError extends Error {
  /**
   * 오류 코드 설정
   */
  public constructor(public readonly code: string) {
    super(code);
  }
}

/**
 * 시트 매핑 준비·활성화 운영 작업
 *
 * 워커 프로세스에서만 실행. 대상 스프레드시트 ID를 명령 인자로 다시 받아 잘못된 매핑 활성화 방지
 */
@Injectable()
export class SheetMappingActivationService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * Google Sheets 게이트웨이
     */
    private readonly gateway: GoogleSheetsGateway,

    /**
     * 실행 환경. 프로세스 역할·시트 사용 여부
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * 매핑 준비 또는 활성화
   *
   * 1. 워커 프로세스·매핑 존재·스프레드시트 ID 확인 일치 확인
   * 2. 검증 중에는 매핑을 BLOCKED로 두고 dispatch lease 해제. 검증 중 반영 방지
   * 3. prepare는 시트 구조 준비, enable은 활성화 검증 수행
   * 4. 성공 시 enable은 CLOSED·활성, prepare는 활성화 대기 사유로 BLOCKED 유지
   *
   * @throws {SheetMappingActivationError} 조건 불일치·검증 실패. 실패 시 매핑은 차단 상태로 남음
   */
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

    // 검증 결과가 나오기 전까지 반영을 막음
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

    // 검증 성공 시각을 기록해 준비 상태 판단에 사용
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

  /**
   * 매핑 차단과 dispatch lease 해제
   */
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

  /**
   * 저장 가능한 차단 사유 코드. 형식이 다르면 일반 검증 실패 코드로 대체
   */
  private safeReason(reason: string): string {
    return /^[A-Z0-9_]{1,80}$/.test(reason) ? reason : "GOOGLE_SHEETS_VALIDATION_FAILED";
  }
}
