/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { copyToClipboard } from "./copy-to-clipboard";

describe("copyToClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the Clipboard API when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const result = await copyToClipboard("hello");
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(result).toBe(true);
  });

  it("falls back to execCommand when Clipboard API throws", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const result = await copyToClipboard("fallback text");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(result).toBe(true);
  });

  it("falls back to execCommand when Clipboard API is missing", async () => {
    Object.assign(navigator, { clipboard: undefined });

    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    const result = await copyToClipboard("text");
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(result).toBe(true);
  });

  it("returns false when both methods fail", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      },
    });

    document.execCommand = vi.fn().mockImplementation(() => {
      throw new Error("execCommand failed");
    });

    const result = await copyToClipboard("text");
    expect(result).toBe(false);
  });
});
