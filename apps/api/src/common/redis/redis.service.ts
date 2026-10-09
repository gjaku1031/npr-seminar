import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { createClient } from "redis";
import { type AppEnvironment } from "../config/environment.js";
import { DomainError } from "../errors/domain-error.js";

/**
 * node-redis 클라이언트 타입
 */
type RedisClient = ReturnType<typeof createClient>;

/**
 * Redis 연결 수명 관리
 *
 * REDIS_URL이 없으면 클라이언트 없이 기동하고, 사용 시점에 503 발생
 * 자동 재연결은 끔. 연결 실패가 요청 오류로 바로 드러나게 함
 */
@Injectable()
export class RedisService implements OnApplicationBootstrap, OnModuleDestroy {
  /**
   * Redis 클라이언트. 미설정이면 null
   */
  private readonly redisClient: RedisClient | null;

  /**
   * REDIS_URL 설정 여부
   */
  public readonly configured: boolean;

  /**
   * 키 접두사. `npr:{실행 환경}:`
   */
  public readonly prefix: string;

  /**
   * 실행 환경에 따라 클라이언트 생성. 연결은 기동 완료 시점에 엶
   */
  public constructor(@Inject("APP_ENVIRONMENT") environment: AppEnvironment) {
    this.configured = environment.redisUrl !== undefined;
    this.prefix = `npr:${environment.appEnv}:`;
    this.redisClient = environment.redisUrl === undefined
      ? null
      : createClient({ url: environment.redisUrl, socket: { connectTimeout: 5_000, reconnectStrategy: false } });
  }

  /**
   * 연결된 클라이언트
   *
   * @throws {DomainError} 503 REDIS_NOT_CONFIGURED
   */
  public get client(): RedisClient {
    if (this.redisClient === null) {
      throw new DomainError(503, "REDIS_NOT_CONFIGURED", "Redis is required for this operation.");
    }
    return this.redisClient;
  }

  /**
   * 애플리케이션 기동 시 연결
   */
  public async onApplicationBootstrap(): Promise<void> {
    if (this.redisClient !== null && !this.redisClient.isOpen) await this.redisClient.connect();
  }

  /**
   * 모듈 종료 시 연결 종료
   */
  public async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen === true) await this.redisClient.quit();
  }
}
