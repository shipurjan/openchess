import { describe, it, expect, vi, afterEach } from "vitest";

describe("prisma", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("throws a clear error when DATABASE_URL is not set", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const mod = (await vi.importActual("./prisma")) as {
      prisma: { game: unknown };
    };

    // Access a property to trigger lazy initialization
    expect(() => mod.prisma.game).toThrow("DATABASE_URL");
  });
});
