import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import {
  SHEET_SCHEMA_FINGERPRINT,
  SHEET_SCHEMA_VERSION,
  SHEET_WORKER_READINESS_TTL_MS,
} from "./google-sheets.gateway.js";

/**
 * 시트 반영 상태·이력 조회
 *
 * 현재 스키마 버전·지문과 같은 매핑만 상태 계산에 포함
 */
@Injectable()
export class SheetAdminService {
  /**
   * DB 클라이언트 주입
   */
  public constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 시트 반영 준비 상태
   *
   * 활성 매핑 중 워커 검증이 유효 기간 안인 것이 있으면 실시간 반영 가능
   * 막힌 경우 사유: 검증 만료, 첫 차단 매핑의 사유, 활성 매핑 없음 순
   */
  public async readiness() {
    const validationCutoff = new Date(Date.now() - SHEET_WORKER_READINESS_TTL_MS);
    const schema = { schemaVersion: SHEET_SCHEMA_VERSION, schemaFingerprint: SHEET_SCHEMA_FINGERPRINT } as const;
    // 매핑 수·활성·최근 검증·준비 완료 수, 첫 차단 사유, 대기·차단 반영 건수를 병렬 조회
    const [mappings, activeMappings, freshActiveMappings, freshValidatedMappings, blockedMapping, pending, blocked] = await Promise.all([
      this.prisma.sheetMapping.count({ where: schema }),
      this.prisma.sheetMapping.count({ where: { ...schema, enabled: true, circuitStatus: "CLOSED" } }),
      this.prisma.sheetMapping.count({
        where: { ...schema, enabled: true, circuitStatus: "CLOSED", lastValidatedAt: { gte: validationCutoff } },
      }),
      this.prisma.sheetMapping.count({
        where: {
          ...schema,
          lastValidatedAt: { gte: validationCutoff },
          OR: [
            { enabled: true, circuitStatus: "CLOSED" },
            { enabled: false, circuitStatus: "BLOCKED", blockReasonCode: "GOOGLE_SHEETS_LIVE_ENABLE_REQUIRED" },
          ],
        },
      }),
      this.prisma.sheetMapping.findFirst({
        where: { ...schema, OR: [{ enabled: false }, { circuitStatus: { not: "CLOSED" } }] },
        orderBy: { id: "asc" }, select: { blockReasonCode: true },
      }),
      this.prisma.sheetOutbox.count({ where: { mapping: schema, status: { in: ["PENDING", "RETRY", "CLAIMED"] } } }),
      this.prisma.sheetOutbox.count({ where: { mapping: schema, status: "BLOCKED" } }),
    ]);
    const liveWritesSupported = freshActiveMappings > 0;
    return {
      enabled: activeMappings > 0,
      spreadsheetConfigured: mappings > 0,
      credentialPathConfigured: freshValidatedMappings > 0,
      adapterAvailable: freshValidatedMappings > 0,
      liveWritesSupported,
      outboundProjectionSupported: true,
      inboundSyncSupported: false,
      blockReasonCode: liveWritesSupported
        ? null
        : activeMappings > 0
          ? "GOOGLE_SHEETS_WORKER_VALIDATION_STALE"
          : blockedMapping?.blockReasonCode ?? "NO_ENABLED_SHEET_MAPPING",
      mappings,
      pendingDeliveries: pending,
      blockedDeliveries: blocked,
    };
  }

  /**
   * 시트 매핑 목록. ID 오름차순
   */
  public async mappings() {
    const rows = await this.prisma.sheetMapping.findMany({ orderBy: { id: "asc" } });
    return { items: rows.map((row) => ({
      mappingId: row.publicId, seminarSessionId: row.seminarSessionPublicId,
      enabled: row.enabled, circuitStatus: row.circuitStatus, blockReasonCode: row.blockReasonCode,
      schemaFingerprint: row.schemaFingerprint, schemaVersion: row.schemaVersion,
      lastValidatedAt: row.lastValidatedAt, lastDispatchAt: row.lastDispatchAt,
    })) };
  }

  /**
   * 반영 대기열 목록. 최신순
   *
   * @param filters limit은 1~200, 기본 50
   */
  public async deliveries(filters: { status?: string; seminarSessionId?: string; limit?: number }) {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const rows = await this.prisma.sheetOutbox.findMany({
      where: {
        ...(filters.status === undefined ? {} : { status: filters.status }),
        ...(filters.seminarSessionId === undefined ? {} : { seminarSessionPublicId: filters.seminarSessionId }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit,
    });
    return { items: rows.map((row) => ({
      deliveryId: row.deliveryPublicId, eventId: row.eventId, eventType: row.eventType,
      seminarSessionId: row.seminarSessionPublicId, familyBookingId: row.familyBookingPublicId,
      familyBookingStudentId: row.familyBookingStudentPublicId, bookingVersion: row.bookingVersion.toString(),
      status: row.status, attemptCount: row.attemptCount, lastErrorCode: row.lastErrorCode,
      createdAt: row.createdAt, completedAt: row.completedAt,
    })) };
  }

  /**
   * 반영 1건과 시도 기록
   *
   * @throws {DomainError} 404 SHEET_DELIVERY_NOT_FOUND
   */
  public async delivery(deliveryId: string) {
    const row = await this.prisma.sheetOutbox.findUnique({
      where: { deliveryPublicId: deliveryId }, include: { attempts: { orderBy: { attemptNo: "asc" } } },
    });
    if (row === null) throw new DomainError(404, "SHEET_DELIVERY_NOT_FOUND", "The Sheet delivery does not exist.");
    return {
      deliveryId: row.deliveryPublicId, eventId: row.eventId, eventType: row.eventType,
      seminarSessionId: row.seminarSessionPublicId, familyBookingId: row.familyBookingPublicId,
      familyBookingStudentId: row.familyBookingStudentPublicId, bookingVersion: row.bookingVersion.toString(),
      status: row.status, attemptCount: row.attemptCount, lastErrorCode: row.lastErrorCode,
      createdAt: row.createdAt, completedAt: row.completedAt,
      attempts: row.attempts.map((attempt) => ({
        eventId: attempt.eventId, attemptNo: attempt.attemptNo, result: attempt.result,
        errorCode: attempt.errorCode, occurredAt: attempt.occurredAt,
      })),
    };
  }
}
