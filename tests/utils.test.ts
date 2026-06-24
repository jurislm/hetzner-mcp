import { describe, it, expect } from "vitest";
import { isSafePathSegment, escapeHtml, formatStartupError } from "../src/utils.js";

describe("isSafePathSegment", () => {
  it("rejects dot-only traversal segments", () => {
    expect(isSafePathSegment(".")).toBe(false);
    expect(isSafePathSegment("..")).toBe(false);
    expect(isSafePathSegment("...")).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isSafePathSegment("")).toBe(false);
  });

  it("accepts ordinary identifiers", () => {
    expect(isSafePathSegment("u123-sub1")).toBe(true);
    expect(isSafePathSegment("12345")).toBe(true);
  });

  it("accepts names that merely contain dots without being dot-only", () => {
    expect(isSafePathSegment(".env")).toBe(true);
    expect(isSafePathSegment("..a")).toBe(true);
    expect(isSafePathSegment("a..")).toBe(true);
    expect(isSafePathSegment("v1.2.3")).toBe(true);
    expect(isSafePathSegment("2024-01-15T12:00:00+01:00")).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("escapes all five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#x27;y&#x27;&gt;&amp;&lt;/a&gt;"
    );
  });
});

describe("formatStartupError", () => {
  it("returns the message for Error instances", () => {
    expect(formatStartupError(new Error("boom"))).toBe("boom");
  });

  it("stringifies non-Error values", () => {
    expect(formatStartupError("plain string")).toBe("plain string");
    expect(formatStartupError(42)).toBe("42");
  });
});
