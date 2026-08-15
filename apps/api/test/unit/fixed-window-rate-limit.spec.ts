import { describe, expect, it, vi } from "vitest";
import { incrementFixedWindowRateLimit } from "../../src/common/redis/fixed-window-rate-limit.js";

describe("incrementFixedWindowRateLimit", () => {
  it("atomically repairs a persistent counter by applying a TTL when Redis reports -1", async () => {
    const evaluate = vi.fn().mockImplementation(async (
      script: string,
      options: { keys: string[]; arguments: string[] },
    ) => {
      expect(script).toContain("redis.call('INCR', KEYS[1])");
      expect(script).toContain("redis.call('TTL', KEYS[1])");
      expect(script).toContain("if ttl < 0 then");
      expect(script).toContain("redis.call('EXPIRE', KEYS[1], ARGV[1])");
      expect(options).toEqual({ keys: ["npr:test:counter"], arguments: ["900"] });
      return 7;
    });
    const redis = { client: { eval: evaluate } };

    await expect(incrementFixedWindowRateLimit(redis as never, "npr:test:counter", 900))
      .resolves.toBe(7);
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("rejects an invalid Redis counter result", async () => {
    const redis = { client: { eval: vi.fn().mockResolvedValue(0) } };

    await expect(incrementFixedWindowRateLimit(redis as never, "npr:test:counter", 60))
      .rejects.toMatchObject({ status: 503, code: "REDIS_RATE_LIMIT_INVALID" });
  });
});
