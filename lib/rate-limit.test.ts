import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./redis", () => ({
  redis: {
    eval: vi.fn(),
  },
}));

import { redis } from "./redis";
import {
  checkRateLimit,
  type RateLimitConfig,
  GAME_CREATION_RATE_LIMIT,
  WS_CONNECTION_RATE_LIMIT,
} from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const config: RateLimitConfig = { maxRequests: 5, windowSeconds: 60 };

  it("allows first request", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 4, 0]);

    const result = await checkRateLimit("192.168.1.1", "game-create", config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it("allows requests under the limit", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 2, 0]);

    const result = await checkRateLimit("192.168.1.1", "game-create", config);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("blocks when limit exceeded", async () => {
    vi.mocked(redis.eval).mockResolvedValue([0, 0, 45]);

    const result = await checkRateLimit("192.168.1.1", "game-create", config);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBe(45);
  });

  it("uses correct Redis key format", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 4, 0]);

    await checkRateLimit("test-ip", "game-create", config);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "ratelimit:game-create:test-ip",
      config.maxRequests,
      config.windowSeconds,
    );
  });

  it("passes custom config to Lua script", async () => {
    vi.mocked(redis.eval).mockResolvedValue([1, 9, 0]);

    const custom: RateLimitConfig = { maxRequests: 10, windowSeconds: 120 };
    await checkRateLimit("192.168.1.1", "custom", custom);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "ratelimit:custom:192.168.1.1",
      10,
      120,
    );
  });

  it("different IPs have independent limits", async () => {
    vi.mocked(redis.eval)
      .mockResolvedValueOnce([1, 4, 0])
      .mockResolvedValueOnce([1, 4, 0]);

    await checkRateLimit("192.168.1.1", "game-create", config);
    await checkRateLimit("192.168.1.2", "game-create", config);

    expect(redis.eval).toHaveBeenCalledTimes(2);
  });
});

describe("rate limit configurations", () => {
  it("GAME_CREATION_RATE_LIMIT has defaults", () => {
    expect(GAME_CREATION_RATE_LIMIT.maxRequests).toBe(10);
    expect(GAME_CREATION_RATE_LIMIT.windowSeconds).toBe(60);
  });

  it("WS_CONNECTION_RATE_LIMIT has defaults", () => {
    expect(WS_CONNECTION_RATE_LIMIT.maxRequests).toBe(30);
    expect(WS_CONNECTION_RATE_LIMIT.windowSeconds).toBe(60);
  });

  it("WS limit is higher than game creation limit", () => {
    expect(WS_CONNECTION_RATE_LIMIT.maxRequests).toBeGreaterThanOrEqual(
      GAME_CREATION_RATE_LIMIT.maxRequests,
    );
  });
});
