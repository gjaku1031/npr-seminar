import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { type Response } from "express";
import { PrismaService } from "../../common/prisma/prisma.service.js";
import { RedisService } from "../../common/redis/redis.service.js";

/**
 * 의존 저장소 상태. ok 정상, not-configured 연결 정보 없음, unavailable 응답 실패
 */
type DependencyStatus = "ok" | "not-configured" | "unavailable";

/**
 * 프로세스 헬스 체크 API
 */
@Controller("health")
export class HealthController {
  /**
   * 의존성 주입
   */
  public constructor(
    /**
     * DB 클라이언트
     */
    private readonly prisma: PrismaService,

    /**
     * Redis 클라이언트
     */
    private readonly redis: RedisService,
  ) {}

  /**
   * 프로세스 생존 확인. 의존성을 검사하지 않음
   */
  @Get("live")
  public live(): { status: "ok" } {
    return { status: "ok" };
  }

  /**
   * 요청 처리 준비 확인
   *
   * PostgreSQL·Redis가 모두 ok면 200, 하나라도 아니면 503과 상태 목록
   */
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

  /**
   * PostgreSQL 연결 상태
   */
  private async postgresStatus(): Promise<DependencyStatus> {
    if (!this.prisma.configured) return "not-configured";
    try {
      await this.prisma.$queryRaw`select 1`;
      return "ok";
    } catch {
      return "unavailable";
    }
  }

  /**
   * Redis 연결 상태
   */
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
