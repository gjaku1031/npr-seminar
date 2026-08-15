import { Injectable } from "@nestjs/common";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { incrementFixedWindowRateLimit } from "../../common/redis/fixed-window-rate-limit.js";
import { RedisService } from "../../common/redis/redis.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { BookingCryptoService } from "./booking-crypto.service.js";

const MANAGEMENT_SESSION_TTL_MS = 30 * 60_000;
const IDEMPOTENCY_SCOPE = "BOOKING_ACCESS_EXCHANGE";
const CONTACT_READ_SESSION_IDEMPOTENCY_SCOPE = "BOOKING_CONTACT_READ_SESSION";

interface BookingAccessIdentity {
  readonly familyBookingId: string;
}

interface ActiveBookingAccessCredential {
  readonly id: bigint;
  readonly status: string;
  readonly expiresAt: Date;
  readonly familyBooking: {
    readonly id: bigint;
    readonly publicId: string;
    readonly contactDigest: Uint8Array;
  };
}

export interface BookingManagementAuthorization {
  readonly familyBookingId: bigint;
  readonly familyBookingPublicId: string;
  readonly contactDigest: Uint8Array;
  readonly managementSessionId: bigint;
}

@Injectable()
export class BookingAccessService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BookingCryptoService,
    private readonly phoneProtector: PhoneProtector,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
  ) {}

  public async exchange(request: Request, rawAccessToken: string, contactValue: string, idempotencyKey: string) {
    const accessDigest = this.crypto.digest(rawAccessToken);
    const accessFingerprint = accessDigest.toString("base64url").slice(0, 12);
    const ipDigest = this.crypto.digest(request.ip ?? request.socket.remoteAddress ?? "unknown").toString("base64url");
    try {
      // Count every exchange attempt, including malformed input and safe
      // idempotent replays, before any database work is performed.
      await this.rateLimit(`${this.redis.prefix}booking-access:ip:${ipDigest}`, 30);
    } catch (error) {
      await this.audit("RATE_LIMITED", accessFingerprint, ipDigest);
      throw error;
    }
    if (!/^[A-Za-z0-9_-]{43}$/u.test(rawAccessToken)) {
      await this.audit("INVALID", accessFingerprint, ipDigest);
      this.invalidAccess();
    }
    let contact: ReturnType<PhoneProtector["protect"]>;
    try {
      contact = this.phoneProtector.protect(contactValue);
    } catch {
      await this.audit("INVALID", accessFingerprint, ipDigest);
      this.invalidAccess();
    }
    const contactKey = Buffer.from(contact.digest).toString("base64url");
    const replayRequest = {
      accessDigest: accessDigest.toString("base64url"),
      contactDigest: contactKey,
    };
    try {
      await Promise.all([
        this.rateLimit(`${this.redis.prefix}booking-access:token:${accessDigest.toString("base64url")}`, 10),
        this.rateLimit(`${this.redis.prefix}booking-access:contact:${contactKey}`, 10),
      ]);
    } catch (error) {
      await this.audit("RATE_LIMITED", accessFingerprint, ipDigest);
      throw error;
    }
    const replay = await this.idempotency.replay<BookingAccessIdentity>(
      IDEMPOTENCY_SCOPE,
      idempotencyKey,
      replayRequest,
    );
    if (replay !== null) {
      const credential = await this.findActiveCredential(
        accessDigest,
        contact.digest,
        accessFingerprint,
        ipDigest,
      );
      if (credential.familyBooking.publicId !== replay.familyBookingId) {
        await this.audit("INVALID", accessFingerprint, ipDigest);
        this.invalidAccess();
      }
      return this.establishSession(request, credential);
    }
    const credential = await this.findActiveCredential(
      accessDigest,
      contact.digest,
      accessFingerprint,
      ipDigest,
    );
    const identity = await this.idempotency.execute<BookingAccessIdentity>(
      IDEMPOTENCY_SCOPE,
      idempotencyKey,
      replayRequest,
      async (transaction) => {
        await this.auditWith(
          transaction,
          "SUCCEEDED",
          accessFingerprint,
          ipDigest,
          credential.familyBooking.publicId,
        );
        return { familyBookingId: credential.familyBooking.publicId };
      },
    );
    if (identity.familyBookingId !== credential.familyBooking.publicId) this.invalidAccess();
    return this.establishSession(request, credential);
  }

  /**
   * Establishes the same booking-scoped read/QR session as a personal access
   * link, but only after an exact full-contact ownership check.  The public
   * update, cancel, QR-rotation, and survey controllers intentionally do not
   * accept this session as mutation authority; they continue to require a
   * fresh BOOKING_MANAGE proof.
   */
  public async establishContactReadSession(
    request: Request,
    familyBookingPublicId: string,
    contactValue: string,
    idempotencyKey: string,
  ) {
    const bookingFingerprint = this.crypto.digest(familyBookingPublicId).toString("base64url").slice(0, 12);
    const ipDigest = this.crypto.digest(request.ip ?? request.socket.remoteAddress ?? "unknown").toString("base64url");
    try {
      await Promise.all([
        this.rateLimit(`${this.redis.prefix}booking-contact-read:ip:${ipDigest}`, 30),
        this.rateLimit(`${this.redis.prefix}booking-contact-read:global`, 600, 60),
      ]);
    } catch (error) {
      await this.auditContactRead("RATE_LIMITED", bookingFingerprint, ipDigest);
      throw this.mapContactReadRateLimit(error);
    }

    let contact: ReturnType<PhoneProtector["protect"]>;
    try {
      contact = this.phoneProtector.protect(contactValue);
    } catch {
      await this.auditContactRead("INVALID", bookingFingerprint, ipDigest);
      this.invalidContactReadSession();
    }
    const contactKey = Buffer.from(contact.digest).toString("base64url");
    try {
      await Promise.all([
        this.rateLimit(`${this.redis.prefix}booking-contact-read:contact:${contactKey}`, 10),
        this.rateLimit(`${this.redis.prefix}booking-contact-read:booking:${bookingFingerprint}`, 10),
      ]);
    } catch (error) {
      await this.auditContactRead("RATE_LIMITED", bookingFingerprint, ipDigest);
      throw this.mapContactReadRateLimit(error);
    }

    const durableRequest = {
      familyBookingId: familyBookingPublicId,
      contactDigest: contactKey,
    };
    const replay = await this.idempotency.replay<BookingAccessIdentity>(
      CONTACT_READ_SESSION_IDEMPOTENCY_SCOPE,
      idempotencyKey,
      durableRequest,
    );
    if (replay !== null && replay.familyBookingId !== familyBookingPublicId) {
      await this.auditContactRead("INVALID", bookingFingerprint, ipDigest);
      this.invalidContactReadSession();
    }

    const credential = await this.findContactOwnedActiveCredential(
      familyBookingPublicId,
      contact.digest,
      bookingFingerprint,
      ipDigest,
    );
    if (replay === null) {
      const identity = await this.idempotency.execute<BookingAccessIdentity>(
        CONTACT_READ_SESSION_IDEMPOTENCY_SCOPE,
        idempotencyKey,
        durableRequest,
        async (transaction) => {
          await this.auditContactReadWith(
            transaction,
            "SUCCEEDED",
            bookingFingerprint,
            ipDigest,
            familyBookingPublicId,
          );
          return { familyBookingId: familyBookingPublicId };
        },
      );
      if (identity.familyBookingId !== familyBookingPublicId) this.invalidContactReadSession();
    }
    return this.establishSession(request, credential);
  }

  private async findActiveCredential(
    accessDigest: Uint8Array,
    contactDigest: Uint8Array,
    accessFingerprint: string,
    ipFingerprint: string,
  ): Promise<ActiveBookingAccessCredential> {
    const credential = await this.prisma.bookingAccessCredential.findUnique({
      where: { tokenDigest: this.bytes(accessDigest) },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        familyBooking: { select: { id: true, publicId: true, contactDigest: true } },
      },
    });
    if (credential === null || credential.status !== "ACTIVE" || credential.expiresAt <= new Date()
      || !this.equal(credential.familyBooking.contactDigest, contactDigest)) {
      await this.audit("INVALID", accessFingerprint, ipFingerprint);
      this.invalidAccess();
    }
    return credential;
  }

  private async findContactOwnedActiveCredential(
    familyBookingPublicId: string,
    contactDigest: Uint8Array,
    bookingFingerprint: string,
    ipFingerprint: string,
  ): Promise<ActiveBookingAccessCredential> {
    const credential = await this.prisma.bookingAccessCredential.findFirst({
      where: {
        familyBooking: {
          publicId: familyBookingPublicId,
          status: { in: ["RESERVED", "CHECKED_IN"] },
        },
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        familyBooking: { select: { id: true, publicId: true, contactDigest: true } },
      },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
    });
    if (credential === null || !this.equal(credential.familyBooking.contactDigest, contactDigest)) {
      await this.auditContactRead("INVALID", bookingFingerprint, ipFingerprint);
      this.invalidContactReadSession();
    }
    return credential;
  }

  private async establishSession(request: Request, credential: ActiveBookingAccessCredential) {
    const previousManagementId = request.session.bookingManagementSessionId;
    if (previousManagementId !== undefined) {
      await this.prisma.bookingManagementSession.updateMany({
        where: { publicId: previousManagementId, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
    }
    await this.regenerate(request);
    const expiresAt = new Date(Date.now() + MANAGEMENT_SESSION_TTL_MS);
    const sessionDigest = this.crypto.digest(request.sessionID);
    const created = await this.prisma.bookingManagementSession.create({
      data: {
        bookingAccessCredentialId: credential.id,
        familyBookingId: credential.familyBooking.id,
        sessionDigest: this.bytes(sessionDigest),
        status: "ACTIVE",
        expiresAt,
      },
      select: { id: true, publicId: true },
    });
    request.session.bookingManagementSessionId = created.publicId;
    request.session.bookingManagementExpiresAt = expiresAt.getTime();
    request.session.csrfToken = randomBytes(32).toString("base64url");
    request.session.cookie.maxAge = MANAGEMENT_SESSION_TTL_MS;
    try {
      await this.save(request);
    } catch (error) {
      await this.prisma.bookingManagementSession.updateMany({
        where: { id: created.id, status: "ACTIVE" },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      throw error;
    }
    return {
      familyBookingId: credential.familyBooking.publicId,
      expiresAt,
      csrfToken: request.session.csrfToken,
    };
  }

  public authorize(request: Request, familyBookingPublicId: string) {
    return this.authorizeWith(this.prisma, request, familyBookingPublicId);
  }

  public authorizeTransaction(
    transaction: Prisma.TransactionClient,
    request: Request,
    familyBookingPublicId: string,
  ) {
    return this.authorizeWith(transaction, request, familyBookingPublicId);
  }

  private async authorizeWith(
    client: Prisma.TransactionClient | PrismaService,
    request: Request,
    familyBookingPublicId: string,
  ): Promise<BookingManagementAuthorization> {
    const publicId = request.session.bookingManagementSessionId;
    const expiresAt = request.session.bookingManagementExpiresAt;
    if (publicId === undefined || expiresAt === undefined || expiresAt <= Date.now()) this.invalidSession(request);
    const row = await client.bookingManagementSession.findUnique({
      where: { publicId },
      select: {
        id: true,
        sessionDigest: true,
        status: true,
        expiresAt: true,
        familyBooking: { select: { id: true, publicId: true, contactDigest: true } },
      },
    });
    const currentDigest = this.crypto.digest(request.sessionID);
    if (row === null || row.status !== "ACTIVE" || row.expiresAt <= new Date()
      || row.familyBooking.publicId !== familyBookingPublicId || !this.equal(row.sessionDigest, currentDigest)) {
      this.invalidSession(request);
    }
    return {
      familyBookingId: row.familyBooking.id,
      familyBookingPublicId: row.familyBooking.publicId,
      contactDigest: row.familyBooking.contactDigest,
      managementSessionId: row.id,
    };
  }

  private regenerate(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.regenerate((error) => error == null ? resolve() : reject(error)));
  }

  private save(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.save((error) => error == null ? resolve() : reject(error)));
  }

  private async rateLimit(key: string, maximum: number, ttlSeconds = 15 * 60): Promise<void> {
    const attempts = await incrementFixedWindowRateLimit(this.redis, key, ttlSeconds);
    if (attempts > maximum) {
      throw new DomainError(429, "BOOKING_ACCESS_RATE_LIMITED", "Too many booking access attempts.");
    }
  }

  private mapContactReadRateLimit(error: unknown): DomainError {
    if (error instanceof DomainError && error.code === "BOOKING_ACCESS_RATE_LIMITED") {
      return new DomainError(429, "BOOKING_READ_SESSION_RATE_LIMITED", "Too many booking read session attempts.");
    }
    if (error instanceof Error) throw error;
    throw error;
  }

  private async audit(
    resultCode: "SUCCEEDED" | "INVALID" | "RATE_LIMITED",
    accessFingerprint: string,
    ipFingerprint: string,
    familyBookingId?: string,
  ): Promise<void> {
    await this.auditWith(this.prisma, resultCode, accessFingerprint, ipFingerprint, familyBookingId);
  }

  private async auditWith(
    client: Prisma.TransactionClient | PrismaService,
    resultCode: "SUCCEEDED" | "INVALID" | "RATE_LIMITED",
    accessFingerprint: string,
    ipFingerprint: string,
    familyBookingId?: string,
  ): Promise<void> {
    await client.authAudit.create({
      data: {
        eventType: "BOOKING_ACCESS_EXCHANGE",
        resultCode,
        safeMetadata: {
          accessFingerprint,
          ipFingerprint: ipFingerprint.slice(0, 12),
          ...(familyBookingId === undefined ? {} : { familyBookingId }),
        },
      },
    });
  }

  private async auditContactRead(
    resultCode: "SUCCEEDED" | "INVALID" | "RATE_LIMITED",
    bookingFingerprint: string,
    ipFingerprint: string,
    familyBookingId?: string,
  ): Promise<void> {
    await this.auditContactReadWith(
      this.prisma,
      resultCode,
      bookingFingerprint,
      ipFingerprint,
      familyBookingId,
    );
  }

  private async auditContactReadWith(
    client: Prisma.TransactionClient | PrismaService,
    resultCode: "SUCCEEDED" | "INVALID" | "RATE_LIMITED",
    bookingFingerprint: string,
    ipFingerprint: string,
    familyBookingId?: string,
  ): Promise<void> {
    await client.authAudit.create({
      data: {
        eventType: "BOOKING_CONTACT_READ_SESSION",
        resultCode,
        safeMetadata: {
          bookingFingerprint,
          ipFingerprint: ipFingerprint.slice(0, 12),
          ...(familyBookingId === undefined ? {} : { familyBookingId }),
        },
      },
    });
  }

  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }

  private invalidAccess(): never {
    throw new DomainError(401, "BOOKING_ACCESS_INVALID", "The booking access link or phone number is invalid.");
  }

  private invalidContactReadSession(): never {
    throw new DomainError(401, "BOOKING_READ_SESSION_INVALID", "The booking or contact is invalid.");
  }

  private invalidSession(request: Request): never {
    delete request.session.bookingManagementSessionId;
    delete request.session.bookingManagementExpiresAt;
    throw new DomainError(401, "BOOKING_MANAGEMENT_SESSION_REQUIRED", "A valid booking management session is required.");
  }
}
