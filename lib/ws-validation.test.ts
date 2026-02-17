import { describe, it, expect } from "vitest";
import {
  validateMessage,
  isValidSquare,
  isValidPromotion,
  isValidGameId,
  checkMessageSize,
  MAX_MESSAGE_SIZE,
  MAX_GAME_ID_LENGTH,
  MAX_TYPE_LENGTH,
} from "./ws-validation";

describe("isValidSquare", () => {
  it("accepts valid squares", () => {
    expect(isValidSquare("a1")).toBe(true);
    expect(isValidSquare("e2")).toBe(true);
    expect(isValidSquare("h8")).toBe(true);
    expect(isValidSquare("d4")).toBe(true);
  });

  it("rejects invalid squares", () => {
    expect(isValidSquare("")).toBe(false);
    expect(isValidSquare("a0")).toBe(false);
    expect(isValidSquare("a9")).toBe(false);
    expect(isValidSquare("i1")).toBe(false);
    expect(isValidSquare("aa1")).toBe(false);
    expect(isValidSquare("1a")).toBe(false);
    expect(isValidSquare(null)).toBe(false);
    expect(isValidSquare(undefined)).toBe(false);
    expect(isValidSquare(123)).toBe(false);
  });
});

describe("isValidPromotion", () => {
  it("accepts valid promotions", () => {
    expect(isValidPromotion("q")).toBe(true);
    expect(isValidPromotion("r")).toBe(true);
    expect(isValidPromotion("b")).toBe(true);
    expect(isValidPromotion("n")).toBe(true);
    expect(isValidPromotion(undefined)).toBe(true);
  });

  it("rejects invalid promotions", () => {
    expect(isValidPromotion("k")).toBe(false);
    expect(isValidPromotion("p")).toBe(false);
    expect(isValidPromotion("Q")).toBe(false);
    expect(isValidPromotion("")).toBe(false);
    expect(isValidPromotion("queen")).toBe(false);
    expect(isValidPromotion(123)).toBe(false);
  });
});

describe("isValidGameId", () => {
  it("accepts valid UUIDs", () => {
    expect(isValidGameId("550e8400-e29b-41d4-a716-446655440000")).toBe(
      true,
    );
    expect(isValidGameId("550E8400-E29B-41D4-A716-446655440000")).toBe(
      true,
    );
  });

  it("rejects non-UUID strings", () => {
    expect(isValidGameId("abc123")).toBe(false);
    expect(isValidGameId("game-id-here")).toBe(false);
  });

  it("rejects invalid types", () => {
    expect(isValidGameId("")).toBe(false);
    expect(isValidGameId(null)).toBe(false);
    expect(isValidGameId(undefined)).toBe(false);
    expect(isValidGameId(123)).toBe(false);
  });

  it("rejects Redis key injection characters", () => {
    expect(isValidGameId("550e8400:e29b-41d4-a716-446655440000")).toBe(
      false,
    );
    expect(isValidGameId("game:malicious")).toBe(false);
    expect(isValidGameId("550e8400*")).toBe(false);
    expect(isValidGameId("*")).toBe(false);
    expect(isValidGameId("550e8400?")).toBe(false);
    expect(isValidGameId("[game]")).toBe(false);
  });
});

describe("validateMessage", () => {
  describe("join messages", () => {
    it("validates correct join", () => {
      const result = validateMessage({
        type: "join",
        gameId: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.message.type).toBe("join");
      }
    });

    it("rejects join without gameId", () => {
      const result = validateMessage({ type: "join" });
      expect(result.valid).toBe(false);
    });

    it("rejects join with non-UUID gameId", () => {
      expect(
        validateMessage({ type: "join", gameId: "abc123" }).valid,
      ).toBe(false);
    });

    it("rejects join with Redis injection in gameId", () => {
      expect(
        validateMessage({ type: "join", gameId: "game:*:seats" }).valid,
      ).toBe(false);
      expect(validateMessage({ type: "join", gameId: "*" }).valid).toBe(
        false,
      );
    });
  });

  describe("move messages", () => {
    it("validates correct move", () => {
      const result = validateMessage({
        type: "move",
        from: "e2",
        to: "e4",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.message).toEqual({
          type: "move",
          from: "e2",
          to: "e4",
        });
      }
    });

    it("validates move with promotion", () => {
      const result = validateMessage({
        type: "move",
        from: "e7",
        to: "e8",
        promotion: "q",
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.message).toEqual({
          type: "move",
          from: "e7",
          to: "e8",
          promotion: "q",
        });
      }
    });

    it("rejects move without from", () => {
      expect(
        validateMessage({ type: "move", to: "e4" }).valid,
      ).toBe(false);
    });

    it("rejects move without to", () => {
      expect(
        validateMessage({ type: "move", from: "e2" }).valid,
      ).toBe(false);
    });

    it("rejects move with invalid squares", () => {
      expect(
        validateMessage({ type: "move", from: "z9", to: "e4" }).valid,
      ).toBe(false);
      expect(
        validateMessage({ type: "move", from: "e2", to: "invalid" }).valid,
      ).toBe(false);
    });

    it("rejects move with invalid promotion", () => {
      expect(
        validateMessage({
          type: "move",
          from: "e7",
          to: "e8",
          promotion: "k",
        }).valid,
      ).toBe(false);
    });
  });

  describe("simple action messages", () => {
    for (const type of [
      "resign",
      "draw_offer",
      "draw_accept",
      "draw_decline",
      "rematch_offer",
      "rematch_accept",
      "flag",
      "claim_win",
    ]) {
      it(`validates ${type}`, () => {
        expect(validateMessage({ type }).valid).toBe(true);
      });
    }
  });

  describe("malformed messages", () => {
    it("rejects null", () => {
      expect(validateMessage(null).valid).toBe(false);
    });

    it("rejects undefined", () => {
      expect(validateMessage(undefined).valid).toBe(false);
    });

    it("rejects non-object", () => {
      expect(validateMessage("not an object").valid).toBe(false);
    });

    it("rejects array", () => {
      expect(validateMessage([]).valid).toBe(false);
    });

    it("rejects missing type", () => {
      expect(validateMessage({ gameId: "abc" }).valid).toBe(false);
    });

    it("rejects non-string type", () => {
      expect(validateMessage({ type: 123 }).valid).toBe(false);
    });

    it("rejects unknown type", () => {
      expect(validateMessage({ type: "unknown_type" }).valid).toBe(false);
    });

    it("rejects prototype pollution attempts", () => {
      expect(validateMessage({ type: "__proto__" }).valid).toBe(false);
      expect(validateMessage({ type: "constructor" }).valid).toBe(false);
    });

    it("rejects excessively long type", () => {
      const result = validateMessage({
        type: "a".repeat(MAX_TYPE_LENGTH + 1),
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain("type too long");
      }
    });
  });
});

describe("checkMessageSize", () => {
  it("allows messages within limit", () => {
    expect(checkMessageSize("{}")).toBeNull();
    expect(checkMessageSize("a".repeat(MAX_MESSAGE_SIZE))).toBeNull();
  });

  it("rejects oversized messages", () => {
    const error = checkMessageSize("a".repeat(MAX_MESSAGE_SIZE + 1));
    expect(error).not.toBeNull();
    expect(error).toContain("too large");
  });
});

describe("length limits", () => {
  it("has sensible constants", () => {
    expect(MAX_MESSAGE_SIZE).toBeGreaterThanOrEqual(100);
    expect(MAX_MESSAGE_SIZE).toBeLessThanOrEqual(10240);
    expect(MAX_GAME_ID_LENGTH).toBeGreaterThanOrEqual(36);
    expect(MAX_TYPE_LENGTH).toBeGreaterThanOrEqual(14);
  });
});
