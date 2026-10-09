import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { type Prisma } from "../../generated/prisma/client.js";

/**
 * 검증된 예약 증명
 */
export interface VerifiedBookingProof {
  /**
   * OTP 증명 감사 행 ID
   */
  readonly auditId: bigint;

  /**
   * 증명 용도. 새 예약 또는 기존 예약 관리
   */
  readonly purpose: "FAMILY_BOOKING" | "BOOKING_MANAGE";

  /**
   * 인증한 연락처 다이제스트
   */
  readonly contactDigest: Uint8Array;

  /**
   * 인증한 연락처 암호문
   */
  readonly contactCiphertext: Uint8Array;

  /**
   * 인증한 연락처 끝 4자리
   */
  readonly contactLast4: string;

  /**
   * 인증 시 선택한 캠퍼스. 없으면 null
   */
  readonly selectedBranchCode: "CAMPUS_A" | "CAMPUS_B" | "CAMPUS_C" | null;

  /**
   * 증명 만료 시각
   */
  readonly expiresAt: Date;
}

/**
 * 예약 증명 소비 추상화
 */
export abstract class OtpProofPort {
  /**
   * 트랜잭션 안에서 증명을 확인하고 1회 사용 처리
   */
  public abstract consume(
    transaction: Prisma.TransactionClient,
    bookingProof: string,
    expectedPurpose: "FAMILY_BOOKING" | "BOOKING_MANAGE",
  ): Promise<VerifiedBookingProof>;
}

/**
 * OTP 인증 후 발급한 예약 증명 확인
 *
 * 증명 원문은 저장하지 않고 SHA-256 다이제스트로 감사 행을 찾음
 */
@Injectable()
export class BookingProofService extends OtpProofPort {
  /**
   * DB 클라이언트 주입
   */
  public constructor(private readonly prisma: PrismaService) { super(); }

  /**
   * 증명을 소비하지 않고 확인. 학생 검색처럼 반복 호출되는 조회용
   *
   * @throws {DomainError} 401 무효·만료, 403 용도 불일치
   */
  public async authorize(bookingProof: string, expectedPurpose: "FAMILY_BOOKING" | "BOOKING_MANAGE"): Promise<VerifiedBookingProof> {
    const digest = this.digest(bookingProof);
    const proof = await this.prisma.otpProofAudit.findUnique({ where: { proofDigest: this.bytes(digest) } });
    return this.valid(proof, expectedPurpose);
  }

  /**
   * 증명 확인 후 1회 사용 처리
   *
   * 감사 행 FOR UPDATE 잠금 후 VERIFIED·미만료일 때만 CONSUMED로 전환. 호출자 트랜잭션과 함께 커밋·롤백
   *
   * @throws {DomainError} 401 무효·만료, 403 용도 불일치, 409 이미 사용됨
   */
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

  /**
   * 감사 행 상태·만료·용도 확인
   *
   * @throws {DomainError} 401 없음·VERIFIED 아님·만료, 403 용도 불일치
   */
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

  /**
   * 증명 원문 형식 확인 후 SHA-256
   *
   * @throws {DomainError} 401 base64url 43자 아님
   */
  private digest(value: string): Buffer {
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new DomainError(401, "BOOKING_PROOF_INVALID", "The booking proof is invalid or expired.");
    return createHash("sha256").update(value).digest();
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
