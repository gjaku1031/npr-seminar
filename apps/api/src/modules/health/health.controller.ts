import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { type Response } from "express";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";

type DependencyStatus = "ok" | "not-configured" | "unavailable";

@Controller("health")
export class HealthController {
  public constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get("live")
  public live(): { status: "ok" } {
    return { status: "ok" };
  }

  @Get("ready")
  public async ready(@Res({ passthrough: true }) response: Response): Promise<{
    status: "ok" | "not-ready";
    dependencies: { postgres: DependencyStatus; redis: DependencyStatus };
  }> {
    const [postgres, redis] = await Promise.all([
      this.postgresStatus(),
      this.redisStatus(),
    ]);
    if (postgres !== "ok" || redis !== "ok") {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: "not-ready", dependencies: { postgres, redis } };
    }
    return { status: "ok", dependencies: { postgres, redis } };
  }

  private async postgresStatus(): Promise<DependencyStatus> {
    if (!this.prisma.configured) return "not-configured";
    try {
      await this.prisma.$queryRaw`select 1`;
      return "ok";
    } catch {
      return "unavailable";
    }
  }

  private async redisStatus(): Promise<DependencyStatus> {
    if (!this.redis.configured) return "not-configured";
    try {
      await this.redis.client.ping();
      return "ok";
    } catch {
      return "unavailable";
    }
  }
}
