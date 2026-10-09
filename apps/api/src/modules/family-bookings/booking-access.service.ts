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

/**
 * 예약 관리 세션 유효 시간(밀리초). 30분
 */
const MANAGEMENT_SESSION_TTL_MS = 30 * 60_000;

/**
 * 관리 링크 교환 멱등 범위
 */
const IDEMPOTENCY_SCOPE = "BOOKING_ACCESS_EXCHANGE";

/**
 * 연락처 확인 읽기 세션 멱등 범위
 */
const CONTACT_READ_SESSION_IDEMPOTENCY_SCOPE = "BOOKING_CONTACT_READ_SESSION";

/**
 * 멱등 기록에 남기는 예약 식별 정보
 */
interface BookingAccessIdentity {
  /**
   * 가족 예약 공개 ID
   */
  readonly familyBookingId: string;
}

/**
 * 활성 관리 링크 자격 증명
 */
interface ActiveBookingAccessCredential {
  /**
   * 자격 증명 ID
   */
  readonly id: bigint;

  /**
   * 상태
   */
  readonly status: string;

  /**
   * 만료 시각
   */
  readonly expiresAt: Date;

  /**
   * 연결된 예약
   */
  readonly familyBooking: {
    /**
     * 예약 ID
     */
    readonly id: bigint;

    /**
     * 예약 공개 ID
     */
    readonly publicId: string;

    /**
     * 예약 연락처 다이제스트
     */
    readonly contactDigest: Uint8Array;
  };
}

/**
 * 예약 관리 세션 확인 결과
 */
export interface BookingManagementAuthorization {
  /**
   * 예약 ID
   */
  readonly familyBookingId: bigint;

  /**
   * 예약 공개 ID
   */
  readonly familyBookingPublicId: string;

  /**
   * 예약 연락처 다이제스트
   */
  readonly contactDigest: Uint8Array;

  /**
   * 관리 세션 ID
   */
  readonly managementSessionId: bigint;
}

/**
 * 예약 관리 세션 발급과 확인
 *
 * 문자로 받은 관리 링크 토큰+연락처, 또는 예약 ID+연락처를 확인해 예약 하나에 묶인 30분 세션 발급
 * 세션은 서버 세션 ID 다이제스트와 DB 행으로 이중 확인
 */
@Injectable()
export class BookingAccessService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 토큰 다이제스트
     */
    private readonly crypto: BookingCryptoService,

    /**
     * 연락처 정규화·다이제스트
     */
    private readonly phoneProtector: PhoneProtector,

    /**
     * 시도 제한 카운터
     */
    private readonly redis: RedisService,

    /**
     * 멱등 처리
     */
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * 관리 링크 토큰과 연락처를 예약 관리 세션으로 교환
   *
   * 1. DB 작업 전에 IP별 30회(15분) 제한. 형식 오류·재생 요청도 셈
   * 2. 토큰 형식·연락처 형식 확인, 토큰별·연락처별 10회 제한
   * 3. 같은 키 재요청이면 자격 증명을 다시 확인하고 같은 예약일 때만 새 세션 발급
   * 4. 활성·미만료이고 연락처가 일치하는 자격 증명 확인 후 성공 감사를 멱등 기록
   * 5. 세션 발급
   *
   * 모든 실패는 감사 기록 후 같은 401로 응답해 토큰·연락처 중 무엇이 틀렸는지 드러내지 않음
   *
   * @throws {DomainError} 401 BOOKING_ACCESS_INVALID, 429 시도 초과
   */
  public async exchange(request: Request, rawAccessToken: string, contactValue: string, idempotencyKey: string) {
    const accessDigest = this.crypto.digest(rawAccessToken);
    const accessFingerprint = accessDigest.toString("base64url").slice(0, 12);
    const ipDigest = this.crypto.digest(request.ip ?? request.socket.remoteAddress ?? "unknown").toString("base64url");
    try {
      // 형식 오류와 멱등 재생을 포함한 모든 교환 시도를 DB 작업 전에 셈
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
   * 예약 ID와 전체 연락처로 읽기·QR 세션 발급
   *
   * 개인 관리 링크와 같은 예약 범위 세션이지만 전체 연락처 소유 확인 후에만 발급
   * 공개 변경·취소·QR 재발급 경로는 이 세션을 변경 권한으로 받지 않고 새 BOOKING_MANAGE 증명을 요구
   *
   * IP별 30회(15분)·전체 600회(1분), 연락처별·예약별 10회 제한
   *
   * @throws {DomainError} 401 BOOKING_READ_SESSION_INVALID, 429 BOOKING_READ_SESSION_RATE_LIMITED
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

    // 같은 키 재요청도 자격 증명과 연락처를 다시 확인
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

  /**
   * 토큰 다이제스트로 활성 관리 링크 자격 증명 조회
   *
   * 활성·미만료이고 예약 연락처가 일치해야 함
   *
   * @throws {DomainError} 401 BOOKING_ACCESS_INVALID. 실패는 감사 기록
   */
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

  /**
   * 예약 ID로 최신 활성 관리 링크 자격 증명 조회
   *
   * 예약·입장 상태 예약만 대상. 예약 연락처가 일치해야 함
   *
   * @throws {DomainError} 401 BOOKING_READ_SESSION_INVALID. 실패는 감사 기록
   */
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

  /**
   * 예약 관리 세션 발급
   *
   * 1. 기존 관리 세션이 있으면 DB에서 폐기
   * 2. 세션 ID 재생성 후 세션 ID 다이제스트로 관리 세션 행 생성
   * 3. 세션에 관리 세션 ID·만료·새 CSRF 토큰 저장, 쿠키 만료 30분
   * 4. 세션 저장 실패 시 방금 만든 관리 세션 행 폐기
   *
   * @returns 예약 ID, 만료 시각, CSRF 토큰
   */
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

  /**
   * 요청 세션이 해당 예약의 유효한 관리 세션인지 확인
   *
   * @throws {DomainError} 401 BOOKING_MANAGEMENT_SESSION_REQUIRED
   */
  public authorize(request: Request, familyBookingPublicId: string) {
    return this.authorizeWith(this.prisma, request, familyBookingPublicId);
  }

  /**
   * 트랜잭션 안에서 관리 세션 확인
   *
   * @throws {DomainError} 401 BOOKING_MANAGEMENT_SESSION_REQUIRED
   */
  public authorizeTransaction(
    transaction: Prisma.TransactionClient,
    request: Request,
    familyBookingPublicId: string,
  ) {
    return this.authorizeWith(transaction, request, familyBookingPublicId);
  }

  /**
   * 관리 세션 확인
   *
   * 세션 값 존재·미만료, DB 행 활성·미만료, 예약 일치, 현재 세션 ID 다이제스트 일치를 모두 확인
   * 실패하면 세션의 관리 세션 값을 지우고 401
   */
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

  /**
   * 세션 ID 재생성
   */
  private regenerate(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.regenerate((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 세션 저장
   */
  private save(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.save((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 고정 창 시도 제한
   *
   * @param ttlSeconds 창 길이(초). 기본 15분
   * @throws {DomainError} 429 BOOKING_ACCESS_RATE_LIMITED
   */
  private async rateLimit(key: string, maximum: number, ttlSeconds = 15 * 60): Promise<void> {
    const attempts = await incrementFixedWindowRateLimit(this.redis, key, ttlSeconds);
    if (attempts > maximum) {
      throw new DomainError(429, "BOOKING_ACCESS_RATE_LIMITED", "Too many booking access attempts.");
    }
  }

  /**
   * 읽기 세션 경로의 시도 제한 오류 코드 변환
   *
   * @returns BOOKING_READ_SESSION_RATE_LIMITED 오류 객체. 다른 오류는 그대로 다시 던짐
   */
  private mapContactReadRateLimit(error: unknown): DomainError {
    if (error instanceof DomainError && error.code === "BOOKING_ACCESS_RATE_LIMITED") {
      return new DomainError(429, "BOOKING_READ_SESSION_RATE_LIMITED", "Too many booking read session attempts.");
    }
    if (error instanceof Error) throw error;
    throw error;
  }

  /**
   * 관리 링크 교환 감사 기록
   */
  private async audit(
    resultCode: "SUCCEEDED" | "INVALID" | "RATE_LIMITED",
    accessFingerprint: string,
    ipFingerprint: string,
    familyBookingId?: string,
  ): Promise<void> {
    await this.auditWith(this.prisma, resultCode, accessFingerprint, ipFingerprint, familyBookingId);
  }

  /**
   * 관리 링크 교환 감사 기록. 토큰 지문 12자와 IP 지문 12자만 저장
   */
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

  /**
   * 읽기 세션 발급 감사 기록
   */
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

  /**
   * 읽기 세션 발급 감사 기록. 예약 지문 12자와 IP 지문 12자만 저장
   */
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

  /**
   * 다이제스트 상수 시간 비교
   */
  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength));
    copy.set(value);
    return copy;
  }

  /**
   * 관리 링크 교환 실패 발생
   *
   * @throws {DomainError} 401 BOOKING_ACCESS_INVALID
   */
  private invalidAccess(): never {
    throw new DomainError(401, "BOOKING_ACCESS_INVALID", "The booking access link or phone number is invalid.");
  }

  /**
   * 읽기 세션 발급 실패 발생
   *
   * @throws {DomainError} 401 BOOKING_READ_SESSION_INVALID
   */
  private invalidContactReadSession(): never {
    throw new DomainError(401, "BOOKING_READ_SESSION_INVALID", "The booking or contact is invalid.");
  }

  /**
   * 세션의 관리 세션 값 제거 후 실패 발생
   *
   * @throws {DomainError} 401 BOOKING_MANAGEMENT_SESSION_REQUIRED
   */
  private invalidSession(request: Request): never {
    delete request.session.bookingManagementSessionId;
    delete request.session.bookingManagementExpiresAt;
    throw new DomainError(401, "BOOKING_MANAGEMENT_SESSION_REQUIRED", "A valid booking management session is required.");
  }
}
