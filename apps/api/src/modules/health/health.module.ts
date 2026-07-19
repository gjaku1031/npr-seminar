import { Module } from "@nestjs/common";
import { PrismaModule } from "../../common/prisma/prisma.module.js";
import { RedisModule } from "../../common/redis/redis.module.js";
import { HealthController } from "./health.controller.js";

@Module({ imports: [PrismaModule, RedisModule], controllers: [HealthController] })
export class HealthModule {}
