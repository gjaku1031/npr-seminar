import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request } from "express";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { incrementFixedWindowRateLimit } from "../../common/redis/fixed-window-rate-limit.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { mapMaskedFamilyBookingRow } from "./public-masked-family-booking.js";

@Injectable()
export class FamilyBookingLookupService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly phoneProtector: PhoneProtector,
  ) {}

  public async lookup(request: Request, contactValue: string) {
    const normalizedContact = this.phoneProtector.normalize(contactValue);
    const contact = this.phoneProtector.protect(normalizedContact);
    const contactKey = Buffer.from(contact.digest).toString("base64url");
    const contactFingerprint = contactKey.slice(0, 16);
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

  private async rateLimit(key: string, maximum: number, ttlSeconds: number): Promise<void> {
    const count = await incrementFixedWindowRateLimit(this.redis, key, ttlSeconds);
    if (count > maximum) {
      throw new DomainError(429, "BOOKING_LOOKUP_RATE_LIMITED", "Too many booking lookup requests.");
    }
  }

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

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }
}
