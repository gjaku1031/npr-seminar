import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { incrementFixedWindowRateLimit } from "../../common/redis/fixed-window-rate-limit.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { mapMaskedFamilyBookingRow } from "./public-masked-family-booking.js";

/**
 * 연락처로 예약 목록 공개 조회. 응답은 이름·연락처 마스킹
 */
@Injectable()
export class FamilyBookingLookupService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 시도 제한 카운터
     */
    private readonly redis: RedisService,

    /**
     * 연락처 정규화·다이제스트
     */
    private readonly phoneProtector: PhoneProtector,
  ) {}

  /**
   * 연락처의 최근 예약 최대 100건 조회
   *
   * 연락처별 10회·IP별 30회(15분), 전체 600회(1분) 제한. 제한 초과와 성공은 연락처·IP 지문만 감사 기록
   *
   * @throws {DomainError} 400 번호 형식, 429 시도 초과
   */
  public async lookup(request: Request, contactValue: string) {
    const normalizedContact = this.phoneProtector.normalize(contactValue);
    const contact = this.phoneProtector.protect(normalizedContact);
    const contactKey = Buffer.from(contact.digest).toString("base64url");
    const contactFingerprint = contactKey.slice(0, 16);
    // 감사·카운터 키에는 연락처·IP 원문 대신 다이제스트 앞 16자만 사용
    const ipFingerprint = createHash("sha256")
      .update(request.ip ?? request.socket.remoteAddress ?? "unknown")
      .digest("base64url")
      .slice(0, 16);
    try {
      await Promise.all([
        this.rateLimit(`${this.redis.prefix}booking-lookup:contact:${contactKey}`, 10, 15 * 60),
        this.rateLimit(`${this.redis.prefix}booking-lookup:ip:${ipFingerprint}`, 30, 15 * 60),
        this.rateLimit(`${this.redis.prefix}booking-lookup:global`, 600, 60),
      ]);
    } catch (error) {
      if (error instanceof DomainError && error.code === "BOOKING_LOOKUP_RATE_LIMITED") {
        await this.audit("RATE_LIMITED", contactFingerprint, ipFingerprint, null);
      }
      throw error;
    }

    // 예약별 참가자 전체와 최신 QR 상태 조회
    const rows = await this.prisma.familyBooking.findMany({
      where: { contactDigest: this.bytes(contact.digest) },
      select: {
        publicId: true,
        attendanceParty: true,
        bookingSource: true,
        seatCount: true,
        status: true,
        version: true,
        createdAt: true,
        updatedAt: true,
        checkedInAt: true,
        cancelledAt: true,
        session: { select: { publicId: true } },
        students: {
          select: {
            active: true,
            releasedAt: true,
            participantType: true,
            studentNameSnapshot: true,
            branchCodeAtBooking: true,
          },
          orderBy: { id: "asc" },
        },
        qrCredentials: {
          select: { status: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    const items = rows.map((row) => mapMaskedFamilyBookingRow(row, normalizedContact));
    await this.audit("SUCCEEDED", contactFingerprint, ipFingerprint, items.length);
    return { items };
  }

  /**
   * 고정 창 조회 시도 제한
   *
   * @throws {DomainError} 429 BOOKING_LOOKUP_RATE_LIMITED
   */
  private async rateLimit(key: string, maximum: number, ttlSeconds: number): Promise<void> {
    const count = await incrementFixedWindowRateLimit(this.redis, key, ttlSeconds);
    if (count > maximum) {
      throw new DomainError(429, "BOOKING_LOOKUP_RATE_LIMITED", "Too many booking lookup requests.");
    }
  }

  /**
   * 조회 감사 기록. 개인정보 원문 없이 지문과 결과 수만 저장
   */
  private async audit(
    resultCode: "SUCCEEDED" | "RATE_LIMITED",
    contactFingerprint: string,
    ipFingerprint: string,
    resultCount: number | null,
  ): Promise<void> {
    await this.prisma.authAudit.create({
      data: {
        eventType: "BOOKING_LOOKUP",
        resultCode,
        safeMetadata: { contactFingerprint, ipFingerprint, resultCount },
      },
    });
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }
}
