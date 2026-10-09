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

/**
 * 예약 QR 자격 증명 재발급·폐기
 *
 * 예약당 ACTIVE QR은 최대 하나. 재발급 시 이전 QR을 REVOKED로 바꾸고 새 QR과 대체 관계 기록
 */
@Injectable()
export class QrService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 토큰 생성·다이제스트
     */
    private readonly crypto: BookingCryptoService,

    /**
     * 이전 방식 OTP 증명 소비
     */
    private readonly bookingProof: BookingProofService,

    /**
     * 예약 관리 세션 확인
     */
    private readonly bookingAccess: BookingAccessService,

    /**
     * QR 원문 토큰 암호화
     */
    private readonly qrTokenProtector: QrTokenProtector,
  ) {}

  /**
   * QR 재발급
   *
   * 권한 경로: 관리자(actorSubject), 이전 방식 OTP 증명(proofValue), 예약 관리 세션(request) 순으로 판단
   *
   * 1. 키 다이제스트 advisory lock 후 같은 키 요청이면 저장 응답 재생(원문 토큰은 재생하지 않음)
   * 2. 예약 행 잠금, 증명·세션 권한 확인, 취소 예약은 거부
   * 3. ACTIVE QR 잠금 후 폐기, 다음 버전 QR 생성과 대체 관계 기록
   * 4. 만료는 회차 시작 6시간 후와 지금부터 1시간 후 중 늦은 시각
   * 5. 이벤트·멱등 응답 저장. 모두 한 트랜잭션이라 실패 시 함께 롤백
   *
   * @param actorSubject 관리자 주체. 공개 경로는 null
   * @param proofValue 이전 방식 OTP 증명. 비어 있으면 관리 세션으로 확인
   * @param request 관리 세션 확인용 요청. 관리자·증명 경로에서는 생략
   * @returns 저장한 자격 증명 정보, 새 원문 토큰(재생 시 없음), 재생 여부
   * @throws {DomainError} 404 예약 없음, 403 증명 연락처 불일치, 401 관리 세션 없음, 409 취소 예약·키 재사용
   */
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
    // 같은 키 동시 요청 직렬화 후 재생 확인
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const replay = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope: "QR_ROTATE", keyDigest: this.bytes(keyDigest) } },
      });
      if (replay !== null) {
        if (!this.equal(replay.requestDigest, requestDigest)) this.fail(409, "IDEMPOTENCY_KEY_REUSED");
        return { credential: replay.responseBody, replayed: true as const };
      }
      // 예약 행 잠금으로 같은 예약의 동시 재발급·취소 직렬화
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
      // 현재 ACTIVE QR 잠금 후 다음 버전 계산
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
      // 기존 QR 폐기 후 새 QR 생성, 이전 QR에 대체 QR 연결
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
      // 원문 토큰은 멱등 기록에 남기지 않음
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

  /**
   * 관리자 QR 폐기
   *
   * 최신 버전 QR이 ACTIVE일 때만 폐기·이벤트 기록. 이미 폐기된 경우 현재 상태만 응답
   *
   * @throws {DomainError} 404 예약·QR 없음, 409 키 재사용
   */
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

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }

  /**
   * 다이제스트 상수 시간 비교
   */
  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * QR 작업 오류 발생
   *
   * @throws {DomainError} 지정 상태·코드
   */
  private fail(status: number, code: string): never {
    throw new DomainError(status, code, "The QR credential operation could not be completed.");
  }
}
