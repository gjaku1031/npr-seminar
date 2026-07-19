import { Inject, Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import { createClient } from "redis";
import { type AppEnvironment } from "../config/environment.js";
import { DomainError } from "../errors/domain-error.js";

type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class RedisService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly redisClient: RedisClient | null;
  public readonly configured: boolean;
  public readonly prefix: string;

  public constructor(@Inject("APP_ENVIRONMENT") environment: AppEnvironment) {
    this.configured = environment.redisUrl !== undefined;
    this.prefix = `npr:${environment.appEnv}:`;
    this.redisClient = environment.redisUrl === undefined
      ? null
      : createClient({ url: environment.redisUrl, socket: { connectTimeout: 5_000, reconnectStrategy: false } });
  }

  public get client(): RedisClient {
    if (this.redisClient === null) {
      throw new DomainError(503, "REDIS_NOT_CONFIGURED", "Redis is required for this operation.");
    }
    return this.redisClient;
  }

  public async onApplicationBootstrap(): Promise<void> {
    if (this.redisClient !== null && !this.redisClient.isOpen) await this.redisClient.connect();
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.redisClient?.isOpen === true) await this.redisClient.quit();
  }
}
