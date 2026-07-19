import { Injectable } from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import { DomainError } from "../errors/domain-error.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

@Injectable()
export class IdempotencyService {
  public constructor(private readonly prisma: PrismaService) {}

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

  public execute<T>(
    scope: string,
    key: string,
    request: unknown,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    responseStatus = 200,
  ): Promise<T> {
    return this.executeWithReplay(scope, key, request, operation, responseStatus).then((result) => result.value);
  }

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

  private digest(value: string): Buffer { return createHash("sha256").update(value).digest(); }
  private validateKey(key: string): void {
    if (key.length < 8 || key.length > 200) {
      throw new DomainError(400, "IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key is required.");
    }
  }
  private stableJson(value: unknown): string {
    return JSON.stringify(value, (_key, nested) => nested !== null && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(Object.entries(nested as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : nested);
  }
  private equal(left: Uint8Array, right: Uint8Array): boolean {
    const a = Buffer.from(left); const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  private bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
    const copy = new Uint8Array(new ArrayBuffer(value.byteLength)); copy.set(value); return copy;
  }
}
