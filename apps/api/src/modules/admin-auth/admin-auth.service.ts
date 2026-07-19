import { Inject, Injectable } from "@nestjs/common";
import { verify } from "argon2";
import { createHmac, randomBytes } from "node:crypto";
import { type Request } from "express";
import { type AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";

const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$XpVgw9rMjiLPGWlvdRZo3Q$/9rMfK3eJg85gPPpeWfRN+S3e3ZY4DvwDivUecjRiTQ";
const LOGIN_WINDOW_SECONDS = 15 * 60;

export interface AdminProfile {
  readonly subjectId: string;
  readonly displayName: string;
  readonly role: "ADMIN" | "SCANNER";
  readonly deviceId: string | null;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
}

interface AdminIdentity { readonly id: string; readonly displayName: string; readonly role: "ADMIN" | "SCANNER"; }

@Injectable()
export class AdminAuthService {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly idempotency: IdempotencyService,
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  public csrf(request: Request): { csrfToken: string; expiresAt: Date } {
    const csrfToken = randomBytes(32).toString("base64url");
    request.session.csrfToken = csrfToken;
    const idleExpiry = Date.now() + this.environment.sessionIdleTtlSeconds * 1_000;
    const expiresAt = new Date(Math.min(idleExpiry, request.session.absoluteExpiresAt ?? idleExpiry));
    return { csrfToken, expiresAt };
  }

  public async login(request: Request, username: string, password: string, key: string): Promise<AdminProfile> {
    const normalizedUsername = username.normalize("NFKC").trim().toLowerCase();
    const replayRequest = {
      username: normalizedUsername,
      passwordDigest: this.identifierDigest(`login-password\u0000${password}`),
    };
    const replay = await this.idempotency.replay<AdminIdentity>("AUTH_LOGIN", key, replayRequest);
    if (replay !== null) {
      return this.establishSession(request, replay);
    }
    const rateKeys = [
      `${this.redis.prefix}auth:login:ip:${this.identifierDigest(request.ip ?? "unknown")}`,
      `${this.redis.prefix}auth:login:account:${this.identifierDigest(normalizedUsername)}`,
    ] as const;
    await Promise.all([
      this.rateLimit(rateKeys[0], 20),
      this.rateLimit(rateKeys[1], 10),
    ]);
    const user = await this.prisma.adminUser.findUnique({ where: { username: normalizedUsername } });
    let passwordAccepted = false;
    try { passwordAccepted = await verify(user?.active === true ? user.passwordHash : DUMMY_PASSWORD_HASH, password); }
    catch { passwordAccepted = false; }
    const accepted = user?.active === true && passwordAccepted;
    if (!accepted || user === null) {
      await this.prisma.authAudit.create({
        data: { eventType: "LOGIN", resultCode: "INVALID_CREDENTIALS", safeMetadata: {} },
      });
      throw new DomainError(401, "AUTH_INVALID_CREDENTIALS", "The credentials are invalid.");
    }
    const role = user.role as AdminProfile["role"];
    const profile: AdminIdentity = { id: user.publicId, displayName: user.displayName, role };
    const durableProfile = await this.idempotency.execute("AUTH_LOGIN", key, replayRequest, async (transaction) => {
      await transaction.authAudit.create({
        data: { adminUserId: user.id, actorSubject: user.publicId, eventType: "LOGIN", resultCode: "SUCCEEDED", safeMetadata: {} },
      });
      return profile;
    });
    const actor = await this.establishSession(request, durableProfile);
    await this.redis.client.del([...rateKeys]);
    return actor;
  }

  public async logout(request: Request, key: string): Promise<void> {
    const replay = await this.idempotency.replay<{ loggedOut: true }>("AUTH_LOGOUT", key, {});
    if (replay === null) {
      const actor = request.session.actor;
      if (actor === undefined) throw new DomainError(401, "SESSION_REQUIRED", "An authenticated session is required.");
      await this.idempotency.execute("AUTH_LOGOUT", key, {}, async (transaction) => {
        await transaction.authAudit.create({ data: {
          actorSubject: actor.subject, eventType: "LOGOUT", resultCode: "SESSION_INVALIDATED", safeMetadata: {},
        } });
        return { loggedOut: true as const };
      }, 204);
    }
    await new Promise<void>((resolve, reject) => request.session.destroy((error) => error == null ? resolve() : reject(error)));
  }

  public async me(request: Request): Promise<AdminProfile> {
    const actor = request.session.actor!;
    if (actor.role === "SCANNER") return this.currentActor(request, {
      id: actor.subject, displayName: "Scanner", role: "SCANNER",
    }, actor.scannerDeviceId ?? actor.subject);
    const user = await this.prisma.adminUser.findUnique({ where: { publicId: actor.subject } });
    if (user === null || !user.active) throw new DomainError(401, "SESSION_REQUIRED", "An authenticated session is required.");
    return this.currentActor(request, { id: user.publicId, displayName: user.displayName, role: "ADMIN" }, null);
  }

  private regenerate(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.regenerate((error) => error == null ? resolve() : reject(error)));
  }

  private async establishSession(request: Request, profile: AdminIdentity): Promise<AdminProfile> {
    const active = await this.prisma.adminUser.count({ where: { publicId: profile.id, active: true, role: profile.role } });
    if (active !== 1) throw new DomainError(401, "AUTH_INVALID_CREDENTIALS", "The credentials are invalid.");
    await this.regenerate(request);
    request.session.actor = { subject: profile.id, role: profile.role };
    request.session.absoluteExpiresAt = Date.now() + this.environment.sessionAbsoluteTtlSeconds * 1_000;
    await this.save(request);
    return this.currentActor(request, profile, null);
  }

  private currentActor(request: Request, identity: AdminIdentity, deviceId: string | null): AdminProfile {
    const absolute = request.session.absoluteExpiresAt;
    if (absolute === undefined) throw new DomainError(401, "SESSION_REQUIRED", "An authenticated session is required.");
    return {
      subjectId: identity.id,
      role: identity.role,
      displayName: identity.displayName,
      deviceId,
      idleExpiresAt: new Date(Date.now() + this.environment.sessionIdleTtlSeconds * 1_000),
      absoluteExpiresAt: new Date(absolute),
    };
  }

  private save(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.save((error) => error == null ? resolve() : reject(error)));
  }

  private identifierDigest(value: string): string {
    const secret = this.environment.sessionSecret;
    if (secret === undefined) throw new DomainError(503, "SESSION_NOT_CONFIGURED", "Authentication is not configured.");
    return createHmac("sha256", Buffer.from(secret, "base64")).update(value).digest("base64url");
  }

  private async rateLimit(key: string, maximum: number): Promise<void> {
    const attempts = await this.redis.client.incr(key);
    if (attempts === 1) await this.redis.client.expire(key, LOGIN_WINDOW_SECONDS);
    if (attempts > maximum) throw new DomainError(429, "AUTH_RATE_LIMITED", "Too many login attempts.");
  }
}
