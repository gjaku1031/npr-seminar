import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { type Prisma } from "../../generated/prisma/client.js";

export interface VerifiedBookingProof {
  readonly auditId: bigint;
  readonly purpose: "FAMILY_BOOKING" | "BOOKING_MANAGE";
  readonly contactDigest: Uint8Array;
  readonly contactCiphertext: Uint8Array;
  readonly contactLast4: string;
  readonly selectedBranchCode: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C" | null;
  readonly expiresAt: Date;
}

export abstract class OtpProofPort {
  public abstract consume(
    transaction: Prisma.TransactionClient,
    bookingProof: string,
    expectedPurpose: "FAMILY_BOOKING" | "BOOKING_MANAGE",
  ): Promise<VerifiedBookingProof>;
}

@Injectable()
export class BookingProofService extends OtpProofPort {
  public constructor(private readonly prisma: PrismaService) { super(); }

  public async authorize(bookingProof: string, expectedPurpose: "FAMILY_BOOKING" | "BOOKING_MANAGE"): Promise<VerifiedBookingProof> {
    const digest = this.digest(bookingProof);
    const proof = await this.prisma.otpProofAudit.findUnique({ where: { proofDigest: this.bytes(digest) } });
    return this.valid(proof, expectedPurpose);
  }

  public async consume(transaction: Prisma.TransactionClient, bookingProof: string, expectedPurpose: "FAMILY_BOOKING" | "BOOKING_MANAGE"): Promise<VerifiedBookingProof> {
    const digest = this.digest(bookingProof);
    const rows = await transaction.$queryRaw<Array<{
      id: bigint; purpose: string; contact_digest: Uint8Array; contact_ciphertext: Uint8Array;
      contact_last4: string; selected_branch_code: string | null; status: string; expires_at: Date;
    }>>`select id,purpose,contact_digest,contact_ciphertext,contact_last4,selected_branch_code,status,expires_at
          from otp_proof_audits where proof_digest=${this.bytes(digest)} for update`;
    const proof = this.valid(rows[0] === undefined ? null : {
      id: rows[0].id, purpose: rows[0].purpose, contactDigest: rows[0].contact_digest,
      contactCiphertext: rows[0].contact_ciphertext, contactLast4: rows[0].contact_last4,
      selectedBranchCode: rows[0].selected_branch_code,
      status: rows[0].status, expiresAt: rows[0].expires_at,
    }, expectedPurpose);
    const updated = await transaction.otpProofAudit.updateMany({
      where: { id: proof.auditId, status: "VERIFIED", expiresAt: { gt: new Date() } },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    if (updated.count !== 1) throw new DomainError(409, "BOOKING_PROOF_ALREADY_USED", "The booking proof was already used.");
    return proof;
  }

  private valid(proof: {
    id: bigint; purpose: string; contactDigest: Uint8Array; contactCiphertext: Uint8Array;
    contactLast4: string; selectedBranchCode: string | null; status: string; expiresAt: Date;
  } | null, expectedPurpose: "FAMILY_BOOKING" | "BOOKING_MANAGE"): VerifiedBookingProof {
    if (proof === null || proof.status !== "VERIFIED" || proof.expiresAt <= new Date()) {
      throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    }
    if (proof.purpose !== expectedPurpose) throw new DomainError(403, "BOOKING_PROOF_SCOPE_INVALID", "The booking proof does not authorize this operation.");
    return {
      auditId: proof.id, purpose: proof.purpose as "FAMILY_BOOKING" | "BOOKING_MANAGE",
      contactDigest: proof.contactDigest, contactCiphertext: proof.contactCiphertext,
      contactLast4: proof.contactLast4,
      selectedBranchCode: proof.selectedBranchCode as "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C" | null,
      expiresAt: proof.expiresAt,
    };
  }

  private digest(value: string): Buffer {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    return createHash("sha256").update(value).digest();
  }

  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
