import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { BookingCryptoService } from "../family-bookings/booking-crypto.service.js";
import { BookingProofService } from "../family-bookings/otp-proof.port.js";
import { timingSafeEqual } from "node:crypto";
import type { Prisma } from "../../generated/prisma/client.js";
import type { Request } from "express";
import { BookingAccessService } from "../family-bookings/booking-access.service.js";
import { QrTokenProtector } from "../family-bookings/qr-token-protector.service.js";

@Injectable()
export class QrService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BookingCryptoService,
    private readonly bookingProof: BookingProofService,
    private readonly bookingAccess: BookingAccessService,
    private readonly qrTokenProtector: QrTokenProtector,
  ) {}

  public rotate(familyBookingId: string, actorSubject: string | null, reason: string, idempotencyKey: string, proofValue?: string, request?: Request) {
    const issued = this.crypto.issueQr();
    const tokenCiphertext = this.qrTokenProtector.protect(issued.rawToken);
    const hasLegacyProof = proofValue !== undefined && proofValue.trim().length > 0;
    const keyDigest = this.crypto.digest(`qr-rotate:${familyBookingId}:${idempotencyKey}`);
    const requestDigest = this.crypto.digest(this.crypto.stableJson({
      familyBookingId,
      reason,
      proofDigest: !hasLegacyProof ? null : this.crypto.digest(proofValue!).toString("base64url"),
      authorization: actorSubject === null && !hasLegacyProof ? "MANAGEMENT_SESSION" : null,
    }));
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const replay = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "QR_ROTATE", keyDigest: this.bytes(keyDigest) } },
      });
      if (replay !== null) {
        if (!this.equal(replay.requestDigest, requestDigest)) this.fail(409, "IDEMPOTENCY_KEY_REUSED");
        return { credential: replay.responseBody, replayed: true as const };
      }
      const locked = await transaction.$queryRaw<Array<{
        id: bigint; status: string; session_id: bigint; starts_at: Date; contact_digest: Uint8Array;
      }>>`select fb.id,fb.status,fb.session_id,ss.starts_at,fb.contact_digest
              from family_bookings fb join seminar_sessions ss on ss.id=fb.session_id
             where fb.public_id=${familyBookingId}::uuid for update of fb`;
      const booking = locked[0];
      if (booking === undefined) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      if (hasLegacyProof) {
        const proof = await this.bookingProof.consume(transaction, proofValue!, "BOOKING_MANAGE");
        if (!this.equal(booking.contact_digest, proof.contactDigest)) this.fail(403, "BOOKING_PROOF_CONTACT_MISMATCH");
      } else if (actorSubject === null) {
        if (request === undefined) this.fail(401, "BOOKING_MANAGEMENT_SESSION_REQUIRED");
        await this.bookingAccess.authorizeTransaction(transaction, request, familyBookingId);
      }
      if (booking.status === "CANCELLED") this.fail(409, "BOOKING_CANCELLED");
      const activeCredentials = await transaction.$queryRaw<Array<{ id: bigint; version: number }>>`
        select id,version from qr_credentials
         where family_booking_id=${booking.id} and status='ACTIVE'
         for update`;
      const activeCredential = activeCredentials[0];
      const latestVersion = await transaction.qrCredential.aggregate({
        where: { familyBookingId: booking.id },
        _max: { version: true },
      });
      const version = (latestVersion._max.version ?? 0) + 1;
      const expiresAt = new Date(Math.max(booking.starts_at.getTime() + 6 * 60 * 60 * 1_000, Date.now() + 60 * 60 * 1_000));
      if (activeCredential !== undefined) {
        await transaction.qrCredential.update({
          where: { id: activeCredential.id }, data: { status: "REVOKED", revokedAt: new Date() },
        });
      }
      const next = await transaction.qrCredential.create({
        data: {
          familyBookingId: booking.id,
          tokenDigest: this.bytes(issued.digest),
          tokenCiphertext: this.bytes(tokenCiphertext),
          version,
          status: "ACTIVE",
          expiresAt,
        },
      });
      if (activeCredential !== undefined) {
        await transaction.qrCredential.update({ where: { id: activeCredential.id }, data: { supersededById: next.id } });
      }
      await transaction.bookingEvent.create({
        data: { familyBookingId: booking.id, eventType: "QR_ROTATED", actorSubject, safeMetadata: { version, reason } },
      });
      const storedResponse = {
        credentialId: next.publicId, familyBookingId, version, status: next.status,
        issuedAt: next.issuedAt, expiresAt: next.expiresAt, revokedAt: next.revokedAt,
      };
      await transaction.idempotencyRecord.create({ data: {
        scope: "QR_ROTATE", keyDigest: this.bytes(keyDigest), requestDigest: this.bytes(requestDigest),
        resourcePublicId: familyBookingId, responseStatus: 200,
        responseBody: storedResponse as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      } });
      return { credential: storedResponse, qrToken: issued.rawToken, replayed: false as const };
    }, { timeout: 10_000, maxWait: 5_000 });
  }

  public async revoke(familyBookingId: string, actorSubject: string, reason: string, idempotencyKey: string) {
    const keyDigest = this.crypto.digest(`qr-revoke:${familyBookingId}:${idempotencyKey}`);
    const requestDigest = this.crypto.digest(this.crypto.stableJson({ familyBookingId, reason }));
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const replay = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "QR_REVOKE", keyDigest: this.bytes(keyDigest) } },
      });
      if (replay !== null) {
        if (!this.equal(replay.requestDigest, requestDigest)) this.fail(409, "IDEMPOTENCY_KEY_REUSED");
        return replay.responseBody;
      }
      const booking = await transaction.$queryRaw<Array<{ id: bigint }>>`
        select id from family_bookings where public_id=${familyBookingId}::uuid for update`;
      if (booking[0] === undefined) this.fail(404, "FAMILY_BOOKING_NOT_FOUND");
      const credentials = await transaction.$queryRaw<Array<{ id: bigint }>>`
        select id from qr_credentials where family_booking_id=${booking[0].id} order by version desc for update`;
      if (credentials[0] === undefined) this.fail(404, "QR_CREDENTIAL_NOT_FOUND");
      const current = await transaction.qrCredential.findUniqueOrThrow({ where: { id: credentials[0].id } });
      let credential = current;
      if (current.status === "ACTIVE") {
        credential = await transaction.qrCredential.update({
          where: { id: current.id }, data: { status: "REVOKED", revokedAt: new Date() },
        });
        await transaction.bookingEvent.create({
          data: { familyBookingId: booking[0].id, eventType: "QR_REVOKED", actorSubject, safeMetadata: { reason } },
        });
      }
      const response = {
        credentialId: credential.publicId, familyBookingId, version: credential.version, status: credential.status,
        issuedAt: credential.issuedAt, expiresAt: credential.expiresAt, revokedAt: credential.revokedAt,
      };
      await transaction.idempotencyRecord.create({ data: {
        scope: "QR_REVOKE", keyDigest: this.bytes(keyDigest), requestDigest: this.bytes(requestDigest),
        resourcePublicId: familyBookingId, responseStatus: 200, responseBody: response,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
      } });
      return response;
    });
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }

  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The QR credential operation could not be completed.");
  }
}
