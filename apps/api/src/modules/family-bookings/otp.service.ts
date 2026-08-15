import { Inject, Injectable } from "@nestjs/common";
import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { AppEnvironment } from "../../common/config/environment.js";
import { PhoneProtector } from "../../common/crypto/phone-protector.service.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { SmsOutboxService, type SmsBranch } from "../sms/sms-outbox.service.js";
import { SmsTemplateCatalog } from "../sms/sms-template-catalog.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

type OtpPurpose = "FAMILY_BOOKING" | "BOOKING_MANAGE";

@Injectable()
export class OtpService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly phoneProtector: PhoneProtector,
    private readonly idempotency: IdempotencyService,
    private readonly smsOutbox: SmsOutboxService,
    private readonly smsTemplates: SmsTemplateCatalog,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  public async create(request: Request, contactValue: string, purpose: OtpPurpose, idempotencyKey: string, selectedBranch?: SmsBranch) {
    if (!this.environment.smsEnabled) throw new DomainError(503, "SMS_UNAVAILABLE", "SMS delivery is unavailable.");
    const normalizedContact = this.phoneProtector.normalize(contactValue);
    if (this.environment.smsRecipientAllowlistEnabled && !this.environment.smsTestRecipients.has(normalizedContact)) {
      throw new DomainError(503, "SMS_UNAVAILABLE", "SMS delivery is unavailable.");
    }
    const contact = this.phoneProtector.protect(normalizedContact);
    if (purpose === "FAMILY_BOOKING" && selectedBranch === undefined) {
      throw new DomainError(400, "BOOKING_CAMPUS_REQUIRED", "A campus is required for booking verification.");
    }
    const contactKey = Buffer.from(contact.digest).toString("base64url");
    const replayRequest = { contactDigest: contactKey, purpose, selectedBranch: selectedBranch ?? null };
    const replay = await this.idempotency.replay<{ challengeId: string; expiresAt: string; retryAfterSeconds: number }>(
      "OTP_CHALLENGE_CREATE", idempotencyKey, replayRequest,
    );
    if (replay !== null) return replay;
    const ipKey = createHash("sha256").update(request.ip ?? request.socket.remoteAddress ?? "unknown").digest("base64url");
    await Promise.all([
      this.rateLimit(`${this.redis.prefix}otp:request:contact:${contactKey}`, 5, 15 * 60),
      this.rateLimit(`${this.redis.prefix}otp:request:ip:${ipKey}`, 20, 15 * 60),
      this.rateLimit(`${this.redis.prefix}otp:request:global`, 600, 60),
    ]);
    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeDigest = this.codeDigest(challengeId, code);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    return this.idempotency.execute("OTP_CHALLENGE_CREATE", idempotencyKey, replayRequest, async (transaction) => {
      const activeStudentBranches = await transaction.student.findMany({
        where: {
          sourceActive: true,
          OR: [
            { motherPhoneDigest: this.bytes(contact.digest) },
            { fatherPhoneDigest: this.bytes(contact.digest) },
          ],
        },
        select: { branch: { select: { code: true } } },
        distinct: ["branchId"],
      });
      let branch = purpose === "FAMILY_BOOKING"
        ? selectedBranch ?? null
        : this.selectBranch(activeStudentBranches.map((row) => row.branch.code));
      if (branch === null && purpose === "BOOKING_MANAGE") {
        const bookingBranches = await transaction.familyBookingStudent.findMany({
          where: { familyBooking: { contactDigest: this.bytes(contact.digest) } },
          select: { branchCodeAtBooking: true },
          distinct: ["branchCodeAtBooking"],
          orderBy: { id: "desc" },
        });
        branch = this.selectBranch(bookingBranches.map((row) => row.branchCodeAtBooking));
      }
      if (branch === null) throw new DomainError(409, "OTP_DELIVERY_ROUTE_UNAVAILABLE", "An SMS delivery route could not be selected.");
      await transaction.otpChallenge.create({
        data: {
          publicId: challengeId,
          purpose,
          contactDigest: this.bytes(contact.digest),
          contactCiphertext: this.bytes(contact.ciphertext),
          contactLast4: contact.last4,
          selectedBranchCode: purpose === "FAMILY_BOOKING" ? (selectedBranch ?? null) : null,
          codeDigest: this.bytes(codeDigest),
          status: "PENDING",
          expiresAt,
        },
      });
      const rendered = await this.smsTemplates.renderDefault(transaction, "OTP", {
        verificationCode: code,
        studentName: "",
        seminarTitle: "",
        sessionDateTime: "",
        place: "",
        bookingUrl: "",
        inquiryPhone: "",
      }, {
        key: "SYSTEM_OTP",
        body: "[예시학원] 인증번호는 {인증번호}입니다. 5분 이내 입력해주세요.",
      });
      await this.smsOutbox.enqueue(transaction, {
        eventKey: `OTP:${challengeId}`,
        source: "OTP",
        branch,
        recipientCiphertext: contact.ciphertext,
        recipientDigest: contact.digest,
        recipientLast4: contact.last4,
        message: rendered.message,
        title: rendered.title,
        safeMetadata: { purpose, ...rendered.snapshot },
      });
      return { challengeId, expiresAt, retryAfterSeconds: 60 };
    }, 201);
  }

  public async verify(request: Request, challengeId: string, code: string, idempotencyKey: string) {
    const suppliedDigest = this.codeDigest(challengeId, code);
    const replayRequest = { challengeId, codeDigest: suppliedDigest.toString("base64url") };
    const replay = await this.idempotency.replay<
      { ok: true; replayed: true; expiresAt: string; scopes: string[] } | { ok: false; code: string }
    >("OTP_CHALLENGE_VERIFY", idempotencyKey, replayRequest);
    if (replay !== null) {
      if (!replay.ok) throw new DomainError(400, replay.code, "The OTP is invalid or expired.");
      return { expiresAt: replay.expiresAt, scopes: replay.scopes, replayed: true };
    }
    const ipKey = createHash("sha256").update(request.ip ?? request.socket.remoteAddress ?? "unknown").digest("base64url");
    await Promise.all([
      this.rateLimit(`${this.redis.prefix}otp:verify:challenge:${challengeId}`, 10, 15 * 60),
      this.rateLimit(`${this.redis.prefix}otp:verify:ip:${ipKey}`, 40, 15 * 60),
      this.rateLimit(`${this.redis.prefix}otp:verify:global`, 1_200, 60),
    ]);
    const keyDigest = createHash("sha256").update(`OTP_CHALLENGE_VERIFY\u0000${idempotencyKey}`).digest();
    const requestDigest = createHash("sha256").update(JSON.stringify(replayRequest)).digest();
    const outcome = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "OTP_CHALLENGE_VERIFY", keyDigest: this.bytes(keyDigest) } },
      });
      if (existing !== null) {
        if (!this.equal(existing.requestDigest, requestDigest)) throw new DomainError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used for another verification.");
        return existing.responseBody as unknown as { ok: true; replayed: true; expiresAt: string; scopes: string[] } | { ok: false; code: string };
      }
      const rows = await transaction.$queryRaw<Array<{
        id: bigint; purpose: OtpPurpose; contact_digest: Uint8Array; contact_ciphertext: Uint8Array; contact_last4: string;
        code_digest: Uint8Array; status: string;
        attempt_count: number; max_attempts: number; expires_at: Date; otp_proof_audit_id: bigint | null;
        selected_branch_code: SmsBranch | null;
      }>>`select id,purpose,contact_digest,contact_ciphertext,contact_last4,selected_branch_code,code_digest,status,attempt_count,max_attempts,expires_at,otp_proof_audit_id
             from otp_challenges where public_id=${challengeId}::uuid for update`;
      const challenge = rows[0];
      if (challenge === undefined) return this.recordVerification(transaction, keyDigest, requestDigest, { ok: false, code: "OTP_INVALID_OR_EXPIRED" }, 400);
      if (challenge.status === "VERIFIED" && challenge.otp_proof_audit_id !== null) {
        const proof = await transaction.otpProofAudit.findUniqueOrThrow({ where: { id: challenge.otp_proof_audit_id } });
        const replay = { ok: true as const, replayed: true as const, expiresAt: proof.expiresAt.toISOString(), scopes: this.scopes(challenge.purpose) };
        return this.recordVerification(transaction, keyDigest, requestDigest, replay, 200, proof.publicId);
      }
      if (challenge.status !== "PENDING" || challenge.expires_at <= new Date()) {
        if (challenge.status === "PENDING") await transaction.otpChallenge.update({ where: { id: challenge.id }, data: { status: "EXPIRED" } });
        return this.recordVerification(transaction, keyDigest, requestDigest, { ok: false, code: "OTP_INVALID_OR_EXPIRED" }, 400);
      }
      if (!this.equal(challenge.code_digest, suppliedDigest)) {
        const attempts = challenge.attempt_count + 1;
        await transaction.otpChallenge.update({
          where: { id: challenge.id },
          data: { attemptCount: attempts, ...(attempts >= challenge.max_attempts ? { status: "LOCKED" } : {}) },
        });
        return this.recordVerification(transaction, keyDigest, requestDigest, { ok: false, code: "OTP_INVALID_OR_EXPIRED" }, 400);
      }
      const bookingProof = randomBytes(32).toString("base64url");
      const proofDigest = createHash("sha256").update(bookingProof).digest();
      const proof = await transaction.otpProofAudit.create({
        data: {
          proofDigest: this.bytes(proofDigest),
          purpose: challenge.purpose,
          contactDigest: this.bytes(challenge.contact_digest),
          contactCiphertext: this.bytes(challenge.contact_ciphertext),
          contactLast4: challenge.contact_last4,
          selectedBranchCode: challenge.selected_branch_code,
          status: "VERIFIED",
          expiresAt: new Date(Date.now() + 10 * 60_000),
          verifiedAt: new Date(),
        },
      });
      await transaction.otpChallenge.update({
        where: { id: challenge.id },
        data: { status: "VERIFIED", verifiedAt: new Date(), otpProofAuditId: proof.id },
      });
      await this.recordVerification(transaction, keyDigest, requestDigest, {
        ok: true, replayed: true, expiresAt: proof.expiresAt.toISOString(), scopes: this.scopes(challenge.purpose),
      }, 200, proof.publicId);
      return {
        ok: true as const, replayed: false as const, bookingProof,
        expiresAt: proof.expiresAt.toISOString(), scopes: this.scopes(challenge.purpose),
      };
    });
    if (!outcome.ok) throw new DomainError(400, outcome.code, "The OTP is invalid or expired.");
    return outcome.replayed
      ? { expiresAt: outcome.expiresAt, scopes: outcome.scopes, replayed: true }
      : { bookingProof: outcome.bookingProof, expiresAt: outcome.expiresAt, scopes: outcome.scopes, replayed: false };
  }

  private async recordVerification<T extends Prisma.InputJsonObject>(
    transaction: Prisma.TransactionClient,
    keyDigest: Buffer,
    requestDigest: Buffer,
    response: T,
    responseStatus: number,
    resourcePublicId?: string,
  ): Promise<T> {
    await transaction.idempotencyRecord.create({ data: {
      scope: "OTP_CHALLENGE_VERIFY", keyDigest: this.bytes(keyDigest), requestDigest: this.bytes(requestDigest),
      ...(resourcePublicId === undefined ? {} : { resourcePublicId }), responseStatus, responseBody: response,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    } });
    return response;
  }

  private scopes(purpose: OtpPurpose): [string, string] {
    return purpose === "FAMILY_BOOKING" ? ["STUDENT_SEARCH", "FAMILY_BOOKING"] : ["BOOKING_READ", "BOOKING_MANAGE"];
  }

  private codeDigest(challengeId: string, code: string): Buffer {
    if (this.environment.otpPepper === undefined) throw new DomainError(503, "OTP_NOT_CONFIGURED", "OTP verification is not configured.");
    return createHmac("sha256", Buffer.from(this.environment.otpPepper, "base64")).update(`${challengeId}\u0000${code}`).digest();
  }

  private selectBranch(values: readonly string[]): SmsBranch | null {
    const set = new Set(values);
    return (["CAMPUS_A", "CAMPUS_B", "CAMPUS_C"] as const).find((branch) => set.has(branch)) ?? null;
  }

  private async rateLimit(key: string, maximum: number, ttlSeconds: number): Promise<void> {
    const attempts = await this.redis.client.incr(key);
    if (attempts === 1) await this.redis.client.expire(key, ttlSeconds);
    if (attempts > maximum) throw new DomainError(429, "OTP_RATE_LIMITED", "Too many OTP requests.");
  }

  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
