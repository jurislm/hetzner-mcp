import { describe, it, expect } from "vitest";
import { formatStartupError } from "../src/index.js";
import { AxiosError, AxiosHeaders } from "axios";

describe("formatStartupError", () => {
  it("returns message string for Error instances", () => {
    const err = new Error("something went wrong");
    expect(formatStartupError(err)).toBe("something went wrong");
  });

  it("converts non-Error to string", () => {
    expect(formatStartupError("plain string error")).toBe("plain string error");
    expect(formatStartupError(42)).toBe("42");
  });

  it("does not expose Authorization header from AxiosError", () => {
    const headers = new AxiosHeaders({ Authorization: "Bearer secret-token-xyz" });
    const axiosErr = new AxiosError(
      "Request failed",
      "ERR_BAD_RESPONSE",
      { headers, url: "https://api.hetzner.cloud/v1/servers" } as never,
      null,
      undefined
    );
    const result = formatStartupError(axiosErr);
    expect(result).not.toContain("secret-token-xyz");
    expect(result).not.toContain("Authorization");
    expect(typeof result).toBe("string");
  });

  it("handles null / undefined gracefully", () => {
    expect(formatStartupError(null)).toBe("null");
    expect(formatStartupError(undefined)).toBe("undefined");
  });
});
