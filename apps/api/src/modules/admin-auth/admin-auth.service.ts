import { Inject, Injectable } from "@nestjs/common";
import { verify } from "argon2";
import { createHmac, randomBytes } from "node:crypto";
import { type Request } from "express";
import { type AppEnvironment } from "../../common/config/environment.js";
import { DomainError } from "../../common/errors/domain-error.js";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";
import { IdempotencyService } from "../../common/idempotency/idempotency.service.js";

/**
 * 없는 계정·비활성 계정에도 argon2 검증 시간을 동일하게 쓰기 위한 더미 해시
 */
const DUMMY_PASSWORD_HASH = "$argon2id$v=19$m=19456,t=2,p=1$XpVgw9rMjiLPGWlvdRZo3Q$/9rMfK3eJg85gPPpeWfRN+S3e3ZY4DvwDivUecjRiTQ";

/**
 * 로그인 시도 제한 창(초)
 */
const LOGIN_WINDOW_SECONDS = 15 * 60;

/**
 * 세션 주체 응답
 */
export interface AdminProfile {
  /**
   * 관리자 공개 ID 또는 스캐너 주체 ID
   */
  readonly subjectId: string;

  /**
   * 표시 이름
   */
  readonly displayName: string;

  /**
   * 권한 역할
   */
  readonly role: "ADMIN" | "SCANNER";

  /**
   * 스캐너 기기 ID. 관리자는 null
   */
  readonly deviceId: string | null;

  /**
   * 유휴 만료 예정 시각. 이번 요청으로 연장된 값
   */
  readonly idleExpiresAt: Date;

  /**
   * 절대 만료 시각
   */
  readonly absoluteExpiresAt: Date;
}

/**
 * 세션 수립에 필요한 최소 신원. 멱등 응답으로 저장됨
 */
interface AdminIdentity { readonly id: string; readonly displayName: string; readonly role: "ADMIN" | "SCANNER"; }

/**
 * 관리자 로그인·로그아웃과 세션 관리
 *
 * 세션 고정 방지를 위해 로그인 성공 시 세션 ID 재생성
 */
@Injectable()
export class AdminAuthService {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * 시도 제한 카운터 저장소
     */
    private readonly redis: RedisService,

    /**
     * 로그인·로그아웃 멱등 처리
     */
    private readonly idempotency: IdempotencyService,

    /**
     * 실행 환경. 세션 만료·비밀 키
     */
    @Inject("APP_ENVIRONMENT") private readonly environment: AppEnvironment,
  ) {}

  /**
   * CSRF 토큰 발급 후 세션에 저장
   *
   * @returns 토큰과 만료 시각. 유휴 만료와 절대 만료 중 이른 시각
   */
  public csrf(request: Request): { csrfToken: string; expiresAt: Date } {
    const csrfToken = randomBytes(32).toString("base64url");
    request.session.csrfToken = csrfToken;
    const idleExpiry = Date.now() + this.environment.sessionIdleTtlSeconds * 1_000;
    const expiresAt = new Date(Math.min(idleExpiry, request.session.absoluteExpiresAt ?? idleExpiry));
    return { csrfToken, expiresAt };
  }

  /**
   * 관리자 로그인
   *
   * 1. ID 정규화(NFKC·공백 제거·소문자), 비밀번호는 HMAC 다이제스트로만 멱등 비교
   * 2. 같은 키의 이전 성공이 있으면 검증 없이 세션만 다시 수립
   * 3. IP별 20회·계정별 10회 15분 시도 제한
   * 4. 계정이 없거나 비활성이어도 더미 해시로 검증해 응답 시간 차이 제거
   * 5. 실패는 감사 기록 후 401, 성공은 감사 기록을 멱등 저장하고 세션 수립 후 시도 카운터 삭제
   *
   * @throws {DomainError} 401 자격 증명 오류, 429 시도 초과, 409 키 재사용
   */
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
    // IP·계정 카운터는 원문 대신 세션 비밀 기반 HMAC으로 키 생성
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
    // 계정 존재 여부가 응답 시간으로 드러나지 않도록 항상 argon2 검증 수행
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
    // 성공 감사 기록과 멱등 응답을 한 트랜잭션에 저장
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

  /**
   * 로그아웃
   *
   * 같은 키 재요청이면 감사 기록 없이 세션 파기만 수행
   *
   * @throws {DomainError} 401 세션 없음
   */
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

  /**
   * 현재 세션 주체 조회
   *
   * 스캐너는 DB 조회 없이 세션 값으로 응답. 관리자는 계정이 아직 활성인지 확인
   *
   * @throws {DomainError} 401 계정 비활성·삭제
   */
  public async me(request: Request): Promise<AdminProfile> {
    const actor = request.session.actor!;
    if (actor.role === "SCANNER") return this.currentActor(request, {
      id: actor.subject, displayName: "Scanner", role: "SCANNER",
    }, actor.scannerDeviceId ?? actor.subject);
    const user = await this.prisma.adminUser.findUnique({ where: { publicId: actor.subject } });
    if (user === null || !user.active) throw new DomainError(401, "SESSION_REQUIRED", "An authenticated session is required.");
    return this.currentActor(request, { id: user.publicId, displayName: user.displayName, role: "ADMIN" }, null);
  }

  /**
   * 세션 ID 재생성
   */
  private regenerate(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.regenerate((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 계정 활성 상태 확인 후 새 세션에 주체와 절대 만료 기록
   *
   * @throws {DomainError} 401 계정이 비활성화되었거나 역할이 바뀐 경우
   */
  private async establishSession(request: Request, profile: AdminIdentity): Promise<AdminProfile> {
    const active = await this.prisma.adminUser.count({ where: { publicId: profile.id, active: true, role: profile.role } });
    if (active !== 1) throw new DomainError(401, "AUTH_INVALID_CREDENTIALS", "The credentials are invalid.");
    await this.regenerate(request);
    request.session.actor = { subject: profile.id, role: profile.role };
    request.session.absoluteExpiresAt = Date.now() + this.environment.sessionAbsoluteTtlSeconds * 1_000;
    await this.save(request);
    return this.currentActor(request, profile, null);
  }

  /**
   * 세션 응답 조립
   *
   * @throws {DomainError} 401 절대 만료 값이 없을 때
   */
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

  /**
   * 세션 저장 완료 대기
   */
  private save(request: Request): Promise<void> {
    return new Promise((resolve, reject) => request.session.save((error) => error == null ? resolve() : reject(error)));
  }

  /**
   * 세션 비밀 기반 HMAC-SHA256 식별자(base64url)
   *
   * @throws {DomainError} 503 세션 비밀 미설정
   */
  private identifierDigest(value: string): string {
    const secret = this.environment.sessionSecret;
    if (secret === undefined) throw new DomainError(503, "SESSION_NOT_CONFIGURED", "Authentication is not configured.");
    return createHmac("sha256", Buffer.from(secret, "base64")).update(value).digest("base64url");
  }

  /**
   * 고정 창 시도 횟수 증가와 상한 확인
   *
   * @param maximum 창 안에서 허용하는 최대 시도 수
   * @throws {DomainError} 429 AUTH_RATE_LIMITED
   */
  private async rateLimit(key: string, maximum: number): Promise<void> {
    const attempts = await this.redis.client.incr(key);
    if (attempts === 1) await this.redis.client.expire(key, LOGIN_WINDOW_SECONDS);
    if (attempts > maximum) throw new DomainError(429, "AUTH_RATE_LIMITED", "Too many login attempts.");
  }
}
