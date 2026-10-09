import { Injectable } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError } from "../errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

/**
 * Idempotency-Key 기반 변경 요청 중복 실행 방지
 *
 * 범위+키의 SHA-256으로 레코드를 찾고, 정렬된 JSON 요청 다이제스트가 다르면 키 재사용으로 거부
 * 저장한 응답은 24시간 보관
 */
@Injectable()
export class IdempotencyService {
  /**
   * DB 클라이언트 주입
   */
  public constructor(private readonly prisma: PrismaService) {}

  /**
   * 트랜잭션 없이 이전 응답만 조회
   *
   * @returns 저장된 응답 본문. 기록이 없으면 null
   * @throws {DomainError} 400 키 형식 오류, 409 같은 키로 다른 요청
   */
  public async replay<T>(scope: string, key: string, request: unknown): Promise<T | null> {
    this.validateKey(key);
    const keyDigest = this.digest(`${scope}\u0000${key}`);
    const requestDigest = this.digest(this.stableJson(request));
    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_keyDigest: { scope, keyDigest: this.bytes(keyDigest) } },
    });
    if (existing === null) return null;
    if (!this.equal(existing.requestDigest, requestDigest)) {
      throw new DomainError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used for a different request.");
    }
    return existing.responseBody as unknown as T;
  }

  /**
   * 멱등 실행 후 응답 값만 반환
   *
   * @param responseStatus 기록할 응답 상태. 기본 200
   */
  public execute<T>(
    scope: string,
    key: string,
    request: unknown,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    responseStatus = 200,
  ): Promise<T> {
    return this.executeWithReplay(scope, key, request, operation, responseStatus).then((result) => result.value);
  }

  /**
   * 멱등 실행과 재생 여부 반환
   *
   * 하나의 트랜잭션에서 실행. operation이 실패하면 레코드도 함께 롤백되어 같은 키로 재시도 가능
   *
   * 1. 키 다이제스트 기준 트랜잭션 advisory lock으로 같은 키 동시 실행 직렬화
   * 2. 기존 레코드가 있으면 요청 일치 확인 후 저장 응답 재생
   * 3. 없으면 operation 실행 후 JSON 직렬화한 결과를 24시간 만료로 저장
   *
   * @returns 결과 값과 재생 여부
   * @throws {DomainError} 400 키 형식 오류, 409 같은 키로 다른 요청
   */
  public executeWithReplay<T>(
    scope: string,
    key: string,
    request: unknown,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    responseStatus = 200,
  ): Promise<{ readonly value: T; readonly replayed: boolean }> {
    this.validateKey(key);
    const keyDigest = this.digest(`${scope}\u0000${key}`);
    const requestDigest = this.digest(this.stableJson(request));
    return this.prisma.$transaction(async (transaction) => {
      // 같은 키 동시 요청은 잠금 대기 후 앞선 요청의 기록을 재생함
      await transaction.$executeRaw`select pg_advisory_xact_lock(${keyDigest.readBigInt64BE()})`;
      const existing = await transaction.idempotencyRecord.findUnique({
        where: { scope_keyDigest: { scope, keyDigest: this.bytes(keyDigest) } },
      });
      if (existing !== null) {
        if (!this.equal(existing.requestDigest, requestDigest)) {
          throw new DomainError(409, "IDEMPOTENCY_KEY_REUSED", "The idempotency key was already used for a different request.");
        }
        return { value: existing.responseBody as unknown as T, replayed: true };
      }
      // 응답은 JSON 왕복으로 Date 등을 문자열화해 재생 결과와 형태를 맞춤
      const result = await operation(transaction);
      const stored = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;
      await transaction.idempotencyRecord.create({
        data: {
          scope, keyDigest: this.bytes(keyDigest), requestDigest: this.bytes(requestDigest),
          responseStatus, responseBody: stored, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000),
        },
      });
      return { value: result, replayed: false };
    }, { timeout: 15_000, maxWait: 5_000 });
  }

  /**
   * SHA-256 다이제스트
   */
  private digest(value: string): Buffer { return createHash("sha256").update(value).digest(); }

  /**
   * Idempotency-Key 길이 확인(8~200자)
   *
   * @throws {DomainError} 400 IDEMPOTENCY_KEY_REQUIRED
   */
  private validateKey(key: string): void {
    if (key.length < 8 || key.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
  }

  /**
   * 객체 키를 정렬한 결정적 JSON 문자열. 배열 순서는 유지
   */
  private stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, nested) => nested !== null && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : nested);
  }

  /**
   * 다이제스트 상수 시간 비교
   */
  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Prisma Bytes 입력용 ArrayBuffer 기반 복사본
   */
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
