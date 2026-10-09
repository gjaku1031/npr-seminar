import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module.js";
import { RedisModule } from "../../common/redis/redis.module.js";
import { HealthController } from "./health.controller.js";

/**
 * 헬스 체크 모듈
 */
@Module({ imports: [PrismaModule, RedisModule], controllers: [HealthController] })
export class HealthModule {}
