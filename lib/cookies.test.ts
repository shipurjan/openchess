import { describe, it, expect } from "vitest";
import { parseCookies } from "./cookies";

describe("parseCookies", () => {
  it("returns empty map for undefined input", () => {
    expect(parseCookies(undefined)).toEqual(new Map());
  });

  it("returns empty map for empty string", () => {
    expect(parseCookies("")).toEqual(new Map());
  });

  it("parses a single cookie", () => {
    const cookies = parseCookies("name=value");
    expect(cookies.get("name")).toBe("value");
  });

  it("parses multiple cookies", () => {
    const cookies = parseCookies("a=1; b=2; c=3");
    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("b")).toBe("2");
    expect(cookies.get("c")).toBe("3");
  });

  it("handles values containing equals signs", () => {
    const cookies = parseCookies("token=abc=def=ghi");
    expect(cookies.get("token")).toBe("abc=def=ghi");
  });

  it("handles whitespace around cookies", () => {
    const cookies = parseCookies("  a=1 ;  b=2  ");
    expect(cookies.get("a")).toBe("1");
    expect(cookies.get("b")).toBe("2");
  });

  it("skips cookies without a value", () => {
    const cookies = parseCookies("valid=yes; invalid; also=good");
    expect(cookies.get("valid")).toBe("yes");
    expect(cookies.get("also")).toBe("good");
    expect(cookies.has("invalid")).toBe(false);
  });

  it("handles empty values", () => {
    const cookies = parseCookies("empty=");
    expect(cookies.get("empty")).toBe("");
  });
});
