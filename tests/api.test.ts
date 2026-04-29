import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AxiosError, AxiosHeaders } from "axios";
import {
  getApiClient,
  getStorageBoxApiClient,
  handleApiError,
  __resetClientsForTesting
} from "../src/api.js";

beforeEach(() => {
  __resetClientsForTesting();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterEach(() => {
  __resetClientsForTesting();
  vi.unstubAllEnvs();
});

describe("resolveCloudToken (via getApiClient)", () => {
  it("uses HETZNER_API_TOKEN", () => {
    vi.stubEnv("HETZNER_API_TOKEN", "cloud-token");
    const client = getApiClient();
    expect(client.defaults.headers["Authorization"]).toBe("Bearer cloud-token");
  });

  it("throws when HETZNER_API_TOKEN is unset", () => {
    vi.stubEnv("HETZNER_API_TOKEN", "");
    expect(() => getApiClient()).toThrowError(/HETZNER_API_TOKEN environment variable is required/);
  });
});

describe("resolveUnifiedToken (via getStorageBoxApiClient)", () => {
  it("uses HETZNER_API_TOKEN_UNIFIED when set", () => {
    vi.stubEnv("HETZNER_API_TOKEN_UNIFIED", "unified-token");
    vi.stubEnv("HETZNER_API_TOKEN", "");
    const client = getStorageBoxApiClient();
    expect(client.defaults.headers["Authorization"]).toBe("Bearer unified-token");
  });

  it("falls back to HETZNER_API_TOKEN when HETZNER_API_TOKEN_UNIFIED is unset", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("HETZNER_API_TOKEN_UNIFIED", "");
    vi.stubEnv("HETZNER_API_TOKEN", "fallback-token");
    const client = getStorageBoxApiClient();
    expect(client.defaults.headers["Authorization"]).toBe("Bearer fallback-token");
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("HETZNER_API_TOKEN_UNIFIED is not set");
    expect(warn.mock.calls[0][0]).toContain("console.hetzner.com/account/security/api-tokens");
  });

  it("prefers HETZNER_API_TOKEN_UNIFIED over HETZNER_API_TOKEN when both are set", () => {
    vi.stubEnv("HETZNER_API_TOKEN_UNIFIED", "unified-token");
    vi.stubEnv("HETZNER_API_TOKEN", "cloud-token");
    const client = getStorageBoxApiClient();
    expect(client.defaults.headers["Authorization"]).toBe("Bearer unified-token");
  });

  it("throws with both env var names AND console URL when neither is set", () => {
    vi.stubEnv("HETZNER_API_TOKEN_UNIFIED", "");
    vi.stubEnv("HETZNER_API_TOKEN", "");
    let caught: Error | undefined;
    try {
      getStorageBoxApiClient();
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toContain("HETZNER_API_TOKEN_UNIFIED");
    expect(caught!.message).toContain("HETZNER_API_TOKEN");
    expect(caught!.message).toContain("https://console.hetzner.com/account/security/api-tokens");
  });
});

function makeAxiosResponseError(status: number, data: unknown): AxiosError {
  const headers = new AxiosHeaders();
  return new AxiosError(
    "request failed",
    String(status),
    undefined,
    undefined,
    {
      status,
      statusText: "",
      headers: {},
      config: { headers },
      data
    }
  );
}

function makeAxiosNetworkError(code: string): AxiosError {
  const err = new AxiosError(`network error ${code}`, code);
  return err;
}

describe("handleApiError — HTTP status codes", () => {
  it("401 returns auth-failed message mentioning both token vars", () => {
    const out = handleApiError(makeAxiosResponseError(401, null));
    expect(out).toContain("Authentication failed");
    expect(out).toContain("HETZNER_API_TOKEN");
    expect(out).toContain("HETZNER_API_TOKEN_UNIFIED");
  });

  it("403 surfaces Hetzner error message when present", () => {
    const out = handleApiError(makeAxiosResponseError(403, { error: { code: "forbidden", message: "not allowed in this project" } }));
    expect(out).toContain("Permission denied");
    expect(out).toContain("not allowed in this project");
  });

  it("404 falls back to default text when Hetzner error shape missing", () => {
    const out = handleApiError(makeAxiosResponseError(404, null));
    expect(out).toContain("Resource not found");
    expect(out).toContain("Please check the ID is correct");
  });

  it("422 surfaces the API message", () => {
    const out = handleApiError(makeAxiosResponseError(422, { error: { code: "invalid_input", message: "name must be unique" } }));
    expect(out).toContain("Invalid request");
    expect(out).toContain("name must be unique");
  });

  it("429 returns rate-limit message", () => {
    expect(handleApiError(makeAxiosResponseError(429, null))).toContain("Rate limit exceeded");
  });

  it("503 returns unavailable message", () => {
    expect(handleApiError(makeAxiosResponseError(503, null))).toContain("temporarily unavailable");
  });

  it("unknown status surfaces both status and Hetzner message", () => {
    const out = handleApiError(makeAxiosResponseError(418, { error: { code: "teapot", message: "I'm a teapot" } }));
    expect(out).toContain("418");
    expect(out).toContain("I'm a teapot");
  });

  it("malformed error.response.data does not crash and falls back to default", () => {
    // C-4: prior cast would have produced "undefined" strings; the narrowed
    // extractor should ignore the bad shape and use the default fallback.
    const out = handleApiError(makeAxiosResponseError(403, "not an object"));
    expect(out).toContain("Permission denied");
    expect(out).toContain("You don't have access");
    expect(out).not.toContain("undefined");
  });
});

describe("handleApiError — network error codes", () => {
  it("ECONNABORTED maps to timeout message", () => {
    expect(handleApiError(makeAxiosNetworkError("ECONNABORTED"))).toContain("timed out");
  });

  it("ETIMEDOUT maps to timeout message", () => {
    expect(handleApiError(makeAxiosNetworkError("ETIMEDOUT"))).toContain("timed out");
  });

  it("ENOTFOUND maps to DNS message", () => {
    expect(handleApiError(makeAxiosNetworkError("ENOTFOUND"))).toContain("resolve");
  });

  it("EAI_AGAIN maps to DNS message", () => {
    expect(handleApiError(makeAxiosNetworkError("EAI_AGAIN"))).toContain("resolve");
  });

  it("ECONNRESET maps to connection-reset message", () => {
    expect(handleApiError(makeAxiosNetworkError("ECONNRESET"))).toContain("reset or refused");
  });

  it("ECONNREFUSED maps to connection-reset message", () => {
    expect(handleApiError(makeAxiosNetworkError("ECONNREFUSED"))).toContain("reset or refused");
  });
});

describe("handleApiError — non-axios errors", () => {
  it("plain Error returns its message", () => {
    expect(handleApiError(new Error("boom"))).toBe("Error: boom");
  });

  it("non-Error value returns generic message", () => {
    expect(handleApiError("not an error")).toContain("unexpected error");
  });
});
