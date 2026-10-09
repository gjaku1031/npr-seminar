import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service.js";

/**
 * Redis 클라이언트 전역 모듈
 */
@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
