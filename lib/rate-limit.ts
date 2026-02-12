import { redis } from "./redis";

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number | null;
}

function rateLimitKey(identifier: string, action: string): string {
  return `ratelimit:${action}:${identifier}`;
}

export async function checkRateLimit(
  identifier: string,
  action: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = rateLimitKey(identifier, action);

  const script = `
    local key = KEYS[1]
    local maxRequests = tonumber(ARGV[1])
    local windowSeconds = tonumber(ARGV[2])

    local current = redis.call('GET', key)
    if current == false then
      redis.call('SET', key, 1, 'EX', windowSeconds)
      return {1, maxRequests - 1, 0}
    end

    local count = tonumber(current)
    if count >= maxRequests then
      local ttl = redis.call('TTL', key)
      return {0, 0, ttl}
    end

    redis.call('INCR', key)
    return {1, maxRequests - count - 1, 0}
  `;

  const result = (await redis.eval(
    script,
    1,
    key,
    config.maxRequests,
    config.windowSeconds,
  )) as [number, number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    retryAfterSeconds: result[2] > 0 ? result[2] : null,
  };
}

export const GAME_CREATION_RATE_LIMIT: RateLimitConfig = {
  maxRequests: parseInt(
    process.env.RATE_LIMIT_GAME_CREATE_MAX ?? "10",
    10,
  ),
  windowSeconds: parseInt(
    process.env.RATE_LIMIT_GAME_CREATE_WINDOW ?? "60",
    10,
  ),
};

export const WS_CONNECTION_RATE_LIMIT: RateLimitConfig = {
  maxRequests: parseInt(
    process.env.RATE_LIMIT_WS_CONNECT_MAX ?? "30",
    10,
  ),
  windowSeconds: parseInt(
    process.env.RATE_LIMIT_WS_CONNECT_WINDOW ?? "60",
    10,
  ),
};
