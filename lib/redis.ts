import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 100, 2000);
    },
  });

redis.on("error", () => {});

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
