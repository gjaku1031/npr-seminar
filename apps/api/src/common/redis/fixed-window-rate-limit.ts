import { DomainError } from "../errors/domain-error.js";
import type { RedisService } from "./redis.service.js";

const FIXED_WINDOW_INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * Atomically increments a fixed-window counter and guarantees it has a TTL.
 * The TTL check also repairs a pre-existing counter that was left persistent
 * by an interrupted legacy INCR/EXPIRE sequence.
 */
export async function incrementFixedWindowRateLimit(
  redis: RedisService,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  const count = Number(await redis.client.eval(FIXED_WINDOW_INCREMENT_SCRIPT, {
    keys: [key],
    arguments: [ttlSeconds.toString()],
  }));
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new DomainError(503, "REDIS_RATE_LIMIT_INVALID", "The rate limiter returned an invalid result.");
  }
  return count;
}
