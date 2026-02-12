import { describe, it, expect } from "vitest";
import {
  getTurnFromFen,
  getPieceColor,
  formatResult,
  formatMoves,
  formatTimestamp,
  formatClockTime,
  formatTimeControl,
  type MoveRecord,
} from "./chess-utils";

describe("getTurnFromFen", () => {
  it("returns white for starting position", () => {
    expect(
      getTurnFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
    ).toBe("white");
  });

  it("returns black when it is black's turn", () => {
    expect(
      getTurnFromFen(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      ),
    ).toBe("black");
  });

  it("returns white for mid-game position with white to move", () => {
    expect(
      getTurnFromFen("r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3"),
    ).toBe("white");
  });
});

describe("getPieceColor", () => {
  it("returns white for white pieces", () => {
    expect(getPieceColor("wP")).toBe("white");
    expect(getPieceColor("wK")).toBe("white");
    expect(getPieceColor("wQ")).toBe("white");
  });

  it("returns black for black pieces", () => {
    expect(getPieceColor("bP")).toBe("black");
    expect(getPieceColor("bK")).toBe("black");
    expect(getPieceColor("bR")).toBe("black");
  });
});

describe("formatResult", () => {
  it("formats white wins", () => {
    expect(formatResult("WHITE_WINS")).toBe("White wins");
  });

  it("formats black wins", () => {
    expect(formatResult("BLACK_WINS")).toBe("Black wins");
  });

  it("formats draw", () => {
    expect(formatResult("DRAW")).toBe("Draw");
  });

  it("returns empty string for null", () => {
    expect(formatResult(null)).toBe("");
  });
});

describe("formatMoves", () => {
  it("returns empty array for no moves", () => {
    expect(formatMoves([])).toEqual([]);
  });

  it("formats a single white move", () => {
    const moves: MoveRecord[] = [{ moveNumber: 1, notation: "e4" }];
    expect(formatMoves(moves)).toEqual([{ num: 1, white: "e4", whiteTimestamp: undefined }]);
  });

  it("formats a complete pair", () => {
    const moves: MoveRecord[] = [
      { moveNumber: 1, notation: "e4" },
      { moveNumber: 2, notation: "e5" },
    ];
    expect(formatMoves(moves)).toEqual([
      { num: 1, white: "e4", whiteTimestamp: undefined, black: "e5", blackTimestamp: undefined },
    ]);
  });

  it("formats multiple pairs", () => {
    const moves: MoveRecord[] = [
      { moveNumber: 1, notation: "e4" },
      { moveNumber: 2, notation: "e5" },
      { moveNumber: 3, notation: "Nf3" },
      { moveNumber: 4, notation: "Nc6" },
    ];
    const result = formatMoves(moves);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ num: 1, white: "e4", black: "e5" });
    expect(result[1]).toMatchObject({ num: 2, white: "Nf3", black: "Nc6" });
  });

  it("handles incomplete last pair (white only)", () => {
    const moves: MoveRecord[] = [
      { moveNumber: 1, notation: "e4" },
      { moveNumber: 2, notation: "e5" },
      { moveNumber: 3, notation: "Nf3" },
    ];
    const result = formatMoves(moves);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ num: 2, white: "Nf3" });
    expect(result[1].black).toBeUndefined();
  });

  it("preserves timestamps", () => {
    const moves: MoveRecord[] = [
      { moveNumber: 1, notation: "e4", createdAt: 1000 },
      { moveNumber: 2, notation: "e5", createdAt: 2000 },
    ];
    const result = formatMoves(moves);
    expect(result[0].whiteTimestamp).toBe(1000);
    expect(result[0].blackTimestamp).toBe(2000);
  });
});

describe("formatTimestamp", () => {
  it("formats a timestamp to a time string", () => {
    const result = formatTimestamp(1700000000000);
    expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

describe("formatClockTime", () => {
  it("returns 0:00 for zero or negative", () => {
    expect(formatClockTime(0)).toBe("0:00");
    expect(formatClockTime(-500)).toBe("0:00");
  });

  it("formats seconds with tenths below 20 seconds", () => {
    expect(formatClockTime(15000)).toBe("15.0");
    expect(formatClockTime(5500)).toBe("5.5");
    expect(formatClockTime(100)).toBe("0.1");
  });

  it("formats minutes:seconds at 20 seconds and above", () => {
    expect(formatClockTime(20000)).toBe("0:20");
    expect(formatClockTime(60000)).toBe("1:00");
    expect(formatClockTime(90000)).toBe("1:30");
    expect(formatClockTime(600000)).toBe("10:00");
  });

  it("rounds up to nearest second above 20s threshold", () => {
    expect(formatClockTime(60100)).toBe("1:01");
    expect(formatClockTime(20001)).toBe("0:21");
  });

  it("pads seconds with leading zero", () => {
    expect(formatClockTime(61000)).toBe("1:01");
    expect(formatClockTime(305000)).toBe("5:05");
  });
});

describe("formatTimeControl", () => {
  it("returns Unlimited for 0 initial time", () => {
    expect(formatTimeControl(0, 0)).toBe("Unlimited");
  });

  it("formats time with zero increment", () => {
    expect(formatTimeControl(300000, 0)).toBe("5+0");
    expect(formatTimeControl(600000, 0)).toBe("10+0");
  });

  it("formats time with increment", () => {
    expect(formatTimeControl(180000, 2000)).toBe("3+2");
    expect(formatTimeControl(600000, 5000)).toBe("10+5");
  });
});
