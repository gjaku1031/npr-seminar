import { HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/common/prisma/prisma.service.js";
import type { RedisService } from "../../src/common/redis/redis.service.js";
import { HealthController } from "../../src/modules/health/health.controller.js";

function response() {
  const status = vi.fn().mockReturnThis();
  return { value: { status } as unknown as Response, status };
}

function controller(input: {
  readonly postgresConfigured: boolean;
  readonly postgresPing?: () => Promise<unknown>;
  readonly redisConfigured: boolean;
  readonly redisPing?: () => Promise<string>;
}) {
  const postgresPing = vi.fn(input.postgresPing ?? (() => Promise.resolve([{ value: 1 }])));
  const redisPing = vi.fn(input.redisPing ?? (() => Promise.resolve("PONG")));
  const prisma = {
    configured: input.postgresConfigured,
    $queryRaw: postgresPing,
  } as unknown as PrismaService;
  const redis = {
    configured: input.redisConfigured,
    get client() {
      if (!input.redisConfigured) throw new Error("Redis client must not be accessed when unconfigured");
      return { ping: redisPing };
    },
  } as unknown as RedisService;
  return { health: new HealthController(prisma, redis), postgresPing, redisPing };
}

describe("HealthController readiness", () => {
  it("reports ready only after real PostgreSQL and Redis pings succeed", async () => {
    const { health, postgresPing, redisPing } = controller({ postgresConfigured: true, redisConfigured: true });
    const http = response();

    await expect(health.ready(http.value)).resolves.toEqual({
      status: "ok",
      dependencies: { postgres: "ok", redis: "ok" },
    });
    expect(postgresPing).toHaveBeenCalledOnce();
    expect(redisPing).toHaveBeenCalledOnce();
    expect(http.status).not.toHaveBeenCalled();
  });

  it("distinguishes an unconfigured dependency while still checking the configured one", async () => {
    const missingPostgres = controller({ postgresConfigured: false, redisConfigured: true });
    const firstHttp = response();
    await expect(missingPostgres.health.ready(firstHttp.value)).resolves.toEqual({
      status: "not-ready",
      dependencies: { postgres: "not-configured", redis: "ok" },
    });
    expect(missingPostgres.postgresPing).not.toHaveBeenCalled();
    expect(missingPostgres.redisPing).toHaveBeenCalledOnce();
    expect(firstHttp.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);

    const missingRedis = controller({ postgresConfigured: true, redisConfigured: false });
    const secondHttp = response();
    await expect(missingRedis.health.ready(secondHttp.value)).resolves.toEqual({
      status: "not-ready",
      dependencies: { postgres: "ok", redis: "not-configured" },
    });
    expect(missingRedis.postgresPing).toHaveBeenCalledOnce();
    expect(missingRedis.redisPing).not.toHaveBeenCalled();
    expect(secondHttp.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it("reports configured but failed pings as unavailable and returns 503", async () => {
    const { health, postgresPing, redisPing } = controller({
      postgresConfigured: true,
      postgresPing: () => Promise.reject(new Error("postgres down")),
      redisConfigured: true,
      redisPing: () => Promise.reject(new Error("redis down")),
    });
    const http = response();

    await expect(health.ready(http.value)).resolves.toEqual({
      status: "not-ready",
      dependencies: { postgres: "unavailable", redis: "unavailable" },
    });
    expect(postgresPing).toHaveBeenCalledOnce();
    expect(redisPing).toHaveBeenCalledOnce();
    expect(http.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
