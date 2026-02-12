import { describe, it, expect } from "vitest";
import { getPlayerRole } from "./game-actions";
import type { Game } from "@/app/generated/prisma/client";

function createMockGame(overrides: Partial<Game> = {}): Game {
  return {
    id: "test-game-id",
    whiteToken: "white-token-123",
    blackToken: "black-token-456",
    status: "IN_PROGRESS",
    result: null,
    isPublic: false,
    timeInitialMs: 600000,
    timeIncrementMs: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("getPlayerRole", () => {
  it("returns white when token matches whiteToken", () => {
    const game = createMockGame();
    expect(getPlayerRole(game, "white-token-123")).toBe("white");
  });

  it("returns black when token matches blackToken", () => {
    const game = createMockGame();
    expect(getPlayerRole(game, "black-token-456")).toBe("black");
  });

  it("returns spectator for undefined token", () => {
    const game = createMockGame();
    expect(getPlayerRole(game, undefined)).toBe("spectator");
  });

  it("returns spectator for unrecognized token", () => {
    const game = createMockGame();
    expect(getPlayerRole(game, "random-token")).toBe("spectator");
  });

  it("returns spectator when blackToken is null and token is unknown", () => {
    const game = createMockGame({ blackToken: null });
    expect(getPlayerRole(game, "some-token")).toBe("spectator");
  });

  it("returns white even when blackToken is null", () => {
    const game = createMockGame({ blackToken: null });
    expect(getPlayerRole(game, "white-token-123")).toBe("white");
  });
});
