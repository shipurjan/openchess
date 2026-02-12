import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage } from "http";

describe("cors", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv } as NodeJS.ProcessEnv;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockRequest(origin?: string): IncomingMessage {
    return {
      headers: origin ? { origin } : {},
    } as IncomingMessage;
  }

  describe("validateWebSocketOrigin in development", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "development";
    });

    it("allows requests without Origin header", async () => {
      const { validateWebSocketOrigin } = await import("./cors");
      expect(validateWebSocketOrigin(createMockRequest())).toBe(true);
    });

    it("allows any origin without CORS config", async () => {
      delete process.env.CORS_ALLOWED_ORIGINS;
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(
          createMockRequest("http://localhost:3000"),
        ),
      ).toBe(true);
      expect(
        validateWebSocketOrigin(createMockRequest("https://evil.com")),
      ).toBe(true);
    });

    it("enforces allowed origins when configured", async () => {
      process.env.CORS_ALLOWED_ORIGINS =
        "http://localhost:3000,https://chess.example.com";
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(
          createMockRequest("http://localhost:3000"),
        ),
      ).toBe(true);
      expect(
        validateWebSocketOrigin(
          createMockRequest("https://chess.example.com"),
        ),
      ).toBe(true);
      expect(
        validateWebSocketOrigin(createMockRequest("https://evil.com")),
      ).toBe(false);
    });
  });

  describe("validateWebSocketOrigin in production", () => {
    beforeEach(() => {
      process.env.NODE_ENV = "production";
    });

    it("allows requests without Origin header", async () => {
      const { validateWebSocketOrigin } = await import("./cors");
      expect(validateWebSocketOrigin(createMockRequest())).toBe(true);
    });

    it("denies cross-origin without CORS config", async () => {
      delete process.env.CORS_ALLOWED_ORIGINS;
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(createMockRequest("https://evil.com")),
      ).toBe(false);
    });

    it("allows configured origins", async () => {
      process.env.CORS_ALLOWED_ORIGINS = "https://chess.example.com";
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(
          createMockRequest("https://chess.example.com"),
        ),
      ).toBe(true);
    });

    it("denies non-configured origins", async () => {
      process.env.CORS_ALLOWED_ORIGINS = "https://chess.example.com";
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(createMockRequest("https://evil.com")),
      ).toBe(false);
    });

    it("handles multiple allowed origins", async () => {
      process.env.CORS_ALLOWED_ORIGINS =
        "https://chess.example.com, https://www.chess.example.com";
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(
          createMockRequest("https://chess.example.com"),
        ),
      ).toBe(true);
      expect(
        validateWebSocketOrigin(
          createMockRequest("https://www.chess.example.com"),
        ),
      ).toBe(true);
      expect(
        validateWebSocketOrigin(createMockRequest("https://other.com")),
      ).toBe(false);
    });
  });

  describe("getCorsHeaders", () => {
    it("returns empty string for undefined origin", async () => {
      process.env.NODE_ENV = "development";
      const { getCorsHeaders } = await import("./cors");
      expect(getCorsHeaders(undefined)).toBe("");
    });

    it("reflects origin in dev without config", async () => {
      process.env.NODE_ENV = "development";
      delete process.env.CORS_ALLOWED_ORIGINS;
      const { getCorsHeaders } = await import("./cors");

      expect(getCorsHeaders("http://localhost:3000")).toBe(
        "Access-Control-Allow-Origin: http://localhost:3000\r\n",
      );
    });

    it("returns header for allowed origin in production", async () => {
      process.env.NODE_ENV = "production";
      process.env.CORS_ALLOWED_ORIGINS = "https://chess.example.com";
      const { getCorsHeaders } = await import("./cors");

      expect(getCorsHeaders("https://chess.example.com")).toBe(
        "Access-Control-Allow-Origin: https://chess.example.com\r\n",
      );
    });

    it("returns empty for disallowed origin", async () => {
      process.env.NODE_ENV = "production";
      process.env.CORS_ALLOWED_ORIGINS = "https://chess.example.com";
      const { getCorsHeaders } = await import("./cors");

      expect(getCorsHeaders("https://evil.com")).toBe("");
    });
  });

  describe("origin parsing edge cases", () => {
    it("handles empty CORS_ALLOWED_ORIGINS", async () => {
      process.env.NODE_ENV = "production";
      process.env.CORS_ALLOWED_ORIGINS = "";
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(createMockRequest("https://any.com")),
      ).toBe(false);
    });

    it("handles whitespace in origins list", async () => {
      process.env.NODE_ENV = "production";
      process.env.CORS_ALLOWED_ORIGINS =
        "  https://chess.example.com  ,  https://www.chess.example.com  ";
      const { validateWebSocketOrigin } = await import("./cors");

      expect(
        validateWebSocketOrigin(
          createMockRequest("https://chess.example.com"),
        ),
      ).toBe(true);
    });
  });
});
