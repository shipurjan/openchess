import { describe, it, expect } from "vitest";
import {
  gameResultToPgn,
  formatPgnDate,
  generatePgn,
  type PgnInput,
} from "./pgn";

describe("gameResultToPgn", () => {
  it("maps WHITE_WINS to 1-0", () => {
    expect(gameResultToPgn("WHITE_WINS")).toBe("1-0");
  });

  it("maps BLACK_WINS to 0-1", () => {
    expect(gameResultToPgn("BLACK_WINS")).toBe("0-1");
  });

  it("maps DRAW to 1/2-1/2", () => {
    expect(gameResultToPgn("DRAW")).toBe("1/2-1/2");
  });

  it("maps null to *", () => {
    expect(gameResultToPgn(null)).toBe("*");
  });
});

describe("formatPgnDate", () => {
  it("formats date as YYYY.MM.DD", () => {
    expect(formatPgnDate(new Date(2025, 0, 5))).toBe("2025.01.05");
  });

  it("pads single-digit months and days", () => {
    expect(formatPgnDate(new Date(2024, 2, 9))).toBe("2024.03.09");
  });

  it("handles double-digit months and days", () => {
    expect(formatPgnDate(new Date(2024, 11, 25))).toBe("2024.12.25");
  });
});

describe("generatePgn", () => {
  const date = new Date(2025, 5, 15);

  it("generates PGN for an empty game", () => {
    const input: PgnInput = { moves: [], result: null, createdAt: date };
    const pgn = generatePgn(input);

    expect(pgn).toContain('[Event "OpenChess Game"]');
    expect(pgn).toContain('[Site "OpenChess"]');
    expect(pgn).toContain('[Date "2025.06.15"]');
    expect(pgn).toContain('[Result "*"]');
    expect(pgn.endsWith("*")).toBe(true);
  });

  it("generates PGN with moves", () => {
    const input: PgnInput = {
      moves: [{ notation: "e4" }, { notation: "e5" }, { notation: "Nf3" }],
      result: null,
      createdAt: date,
    };
    const pgn = generatePgn(input);

    expect(pgn).toContain("1. e4 e5 2. Nf3");
    expect(pgn.endsWith("*")).toBe(true);
  });

  it("generates PGN for a white win", () => {
    const input: PgnInput = {
      moves: [{ notation: "e4" }, { notation: "e5" }],
      result: "WHITE_WINS",
      createdAt: date,
    };
    const pgn = generatePgn(input);

    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn.endsWith("1-0")).toBe(true);
  });

  it("generates PGN for a black win", () => {
    const input: PgnInput = {
      moves: [{ notation: "e4" }, { notation: "e5" }],
      result: "BLACK_WINS",
      createdAt: date,
    };
    const pgn = generatePgn(input);

    expect(pgn).toContain('[Result "0-1"]');
    expect(pgn.endsWith("0-1")).toBe(true);
  });

  it("generates PGN for a draw", () => {
    const input: PgnInput = {
      moves: [{ notation: "e4" }, { notation: "e5" }],
      result: "DRAW",
      createdAt: date,
    };
    const pgn = generatePgn(input);

    expect(pgn).toContain('[Result "1/2-1/2"]');
    expect(pgn.endsWith("1/2-1/2")).toBe(true);
  });

  it("includes all required PGN headers", () => {
    const input: PgnInput = { moves: [], result: null, createdAt: date };
    const pgn = generatePgn(input);

    expect(pgn).toContain('[Event "OpenChess Game"]');
    expect(pgn).toContain('[Site "OpenChess"]');
    expect(pgn).toContain('[Date "');
    expect(pgn).toContain('[Round "-"]');
    expect(pgn).toContain('[White "Anonymous"]');
    expect(pgn).toContain('[Black "Anonymous"]');
    expect(pgn).toContain('[Result "');
  });

  it("separates headers from moves with a blank line", () => {
    const input: PgnInput = {
      moves: [{ notation: "e4" }],
      result: null,
      createdAt: date,
    };
    const pgn = generatePgn(input);
    const parts = pgn.split("\n\n");
    expect(parts.length).toBe(2);
  });
});
