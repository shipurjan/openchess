import { describe, it, expect } from "vitest";
import {
  MOVES_PER_PAGE,
  calculateTotalPages,
  getPageForMove,
  getPageForPair,
  getLastPage,
  getMovesForPage,
  clampPage,
} from "./pagination";

describe("MOVES_PER_PAGE", () => {
  it("is 20", () => {
    expect(MOVES_PER_PAGE).toBe(20);
  });
});

describe("calculateTotalPages", () => {
  it("returns 1 for zero pairs", () => {
    expect(calculateTotalPages(0)).toBe(1);
  });

  it("returns 1 when pairs fit in one page", () => {
    expect(calculateTotalPages(1)).toBe(1);
    expect(calculateTotalPages(20)).toBe(1);
  });

  it("returns 2 when pairs exceed one page", () => {
    expect(calculateTotalPages(21)).toBe(2);
  });

  it("handles exact multiples", () => {
    expect(calculateTotalPages(40)).toBe(2);
    expect(calculateTotalPages(60)).toBe(3);
  });
});

describe("getPageForMove", () => {
  it("returns page 0 for first move", () => {
    expect(getPageForMove(0)).toBe(0);
  });

  it("returns page 0 for moves within first page", () => {
    expect(getPageForMove(39)).toBe(0);
  });

  it("returns page 1 for moves on second page", () => {
    expect(getPageForMove(40)).toBe(1);
  });
});

describe("getPageForPair", () => {
  it("returns page 0 for first pair", () => {
    expect(getPageForPair(0)).toBe(0);
  });

  it("returns page 0 for last pair on first page", () => {
    expect(getPageForPair(19)).toBe(0);
  });

  it("returns page 1 for first pair on second page", () => {
    expect(getPageForPair(20)).toBe(1);
  });
});

describe("getLastPage", () => {
  it("returns 0 for zero pairs", () => {
    expect(getLastPage(0)).toBe(0);
  });

  it("returns 0 for pairs fitting in one page", () => {
    expect(getLastPage(20)).toBe(0);
  });

  it("returns 1 for pairs spanning two pages", () => {
    expect(getLastPage(21)).toBe(1);
  });
});

describe("getMovesForPage", () => {
  const items = Array.from({ length: 50 }, (_, i) => `move-${i}`);

  it("returns first page of items", () => {
    const result = getMovesForPage(items, 0);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("move-0");
    expect(result[19]).toBe("move-19");
  });

  it("returns second page of items", () => {
    const result = getMovesForPage(items, 1);
    expect(result).toHaveLength(20);
    expect(result[0]).toBe("move-20");
  });

  it("returns partial last page", () => {
    const result = getMovesForPage(items, 2);
    expect(result).toHaveLength(10);
    expect(result[0]).toBe("move-40");
  });

  it("returns empty array for out-of-range page", () => {
    expect(getMovesForPage(items, 5)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(getMovesForPage([], 0)).toEqual([]);
  });
});

describe("clampPage", () => {
  it("returns 0 for negative page", () => {
    expect(clampPage(-1, 5)).toBe(0);
  });

  it("returns last page when page exceeds total", () => {
    expect(clampPage(10, 5)).toBe(4);
  });

  it("returns the page when within range", () => {
    expect(clampPage(2, 5)).toBe(2);
  });

  it("returns 0 for single-page total", () => {
    expect(clampPage(0, 1)).toBe(0);
    expect(clampPage(5, 1)).toBe(0);
  });
});
