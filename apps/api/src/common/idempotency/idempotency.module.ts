import { Global, Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service.js";

/**
 * 멱등 요청 처리 전역 모듈
 */
@Global()
@Module({ providers: [IdempotencyService], exports: [IdempotencyService] })
export class IdempotencyModule {}
