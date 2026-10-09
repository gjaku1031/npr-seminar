import { DomainError } from "../errors/domain-error.js";
import type { RedisService } from "./redis.service.js";

/**
 * 고정 창 카운터 증가 Lua 스크립트
 *
 * INCR 후 TTL이 없으면 만료 설정. 원자적으로 실행됨
 */
const FIXED_WINDOW_INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`;

/**
 * 고정 창 속도 제한 카운터를 원자적으로 증가시키고 TTL 보장
 *
 * TTL 확인으로 중단된 INCR/EXPIRE 순차 실행이 남긴 만료 없는 카운터도 복구
 *
 * @param ttlSeconds 창 길이(초). 첫 증가 시에만 적용
 * @returns 증가 후 창 안의 요청 수
 * @throws {DomainError} 503 Redis 결과가 1 이상의 정수가 아닐 때
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
