import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import axios, { AxiosError, AxiosHeaders } from "axios";
import { z } from "zod";
import {
  getApiClient,
  getStorageBoxApiClient,
  handleApiError,
  makeStorageBoxApiRequest,
  createPaginatedFetch,
  __resetClientsForTesting
} from "../src/api.js";
import { ListStorageBoxesResponseSchema, HetznerMetaSchema } from "../src/types.js";

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
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.stubEnv("HETZNER_API_TOKEN_UNIFIED", "");
    vi.stubEnv("HETZNER_API_TOKEN", "fallback-token");
    const client = getStorageBoxApiClient();
    expect(client.defaults.headers["Authorization"]).toBe("Bearer fallback-token");
    expect(stderrWrite).toHaveBeenCalledOnce();
    const message = stderrWrite.mock.calls[0][0] as string;
    expect(message).toContain("HETZNER_API_TOKEN_UNIFIED is not set");
    expect(message).toContain("console.hetzner.com/account/security/api-tokens");
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

describe("handleApiError — extractHetznerErrorMessage edge cases (I-6)", () => {
  it("returns default text when error.response.data.error is null", () => {
    const out = handleApiError(makeAxiosResponseError(403, { error: null }));
    expect(out).toContain("Permission denied");
    expect(out).toContain("You don't have access");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("null");
  });

  it("returns default text when error.message is non-string (e.g., number)", () => {
    const out = handleApiError(makeAxiosResponseError(422, { error: { message: 42 } }));
    expect(out).toContain("Invalid request");
    expect(out).toContain("Please check your parameters");
    expect(out).not.toContain("42");
  });

  it("returns default text when error key is present but its value is non-object", () => {
    const out = handleApiError(makeAxiosResponseError(403, { error: "string-not-object" }));
    expect(out).toContain("Permission denied");
    expect(out).not.toContain("string-not-object");
  });
});

describe("__resetClientsForTesting — production guard (I-5)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("throws when NODE_ENV is 'production' instead of silently returning", () => {
    process.env.NODE_ENV = "production";
    expect(() => __resetClientsForTesting()).toThrowError(/must not be called in production/);
  });

  it("works normally in test/development env", () => {
    process.env.NODE_ENV = "test";
    expect(() => __resetClientsForTesting()).not.toThrow();
  });
});

describe("handleApiError — ZodError (C-1: API boundary mismatch)", () => {
  it("formats ZodError as 'unexpected response shape' with the failing path", () => {
    const result = ListStorageBoxesResponseSchema.safeParse({
      storage_boxes: [
        {
          // missing required fields like name, login, quota_bytes...
          id: 123
        }
      ]
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const out = handleApiError(result.error);
      expect(out).toContain("unexpected response shape");
      expect(out).toContain("storage_boxes.0");
      expect(out).toContain("Please report this issue");
    }
  });

  it("handles top-level ZodError (path = <root>)", () => {
    const result = ListStorageBoxesResponseSchema.safeParse("not an object at all");
    expect(result.success).toBe(false);
    if (!result.success) {
      const out = handleApiError(result.error);
      expect(out).toContain("unexpected response shape");
    }
  });
});

// I-8: end-to-end test for makeStorageBoxApiRequest — proves that
// schema.parse actually runs inside the function (mock-at-axios layer
// instead of mock-at-api layer used elsewhere).
describe("makeStorageBoxApiRequest schema validation (I-8 — end-to-end)", () => {
  beforeEach(() => {
    __resetClientsForTesting();
    vi.stubEnv("HETZNER_API_TOKEN_UNIFIED", "test-token");
    vi.stubEnv("HETZNER_API_TOKEN", "");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    __resetClientsForTesting();
  });

  function stubAxiosWithResponse(data: unknown): void {
    const fakeRequest = vi.fn().mockResolvedValue({ data });
    vi.spyOn(axios, "create").mockReturnValue({
      request: fakeRequest,
      defaults: { headers: {} }
    } as unknown as ReturnType<typeof axios.create>);
  }

  it("validates response and returns parsed data on schema match", async () => {
    stubAxiosWithResponse({
      storage_boxes: [],
      meta: { pagination: { next_page: null } }
    });
    const schema = z.object({
      storage_boxes: z.array(z.unknown()),
      meta: z.object({ pagination: z.object({ next_page: z.number().nullable() }) }).optional()
    });

    const result = await makeStorageBoxApiRequest("/storage_boxes", schema);

    expect(result).toEqual({
      storage_boxes: [],
      meta: { pagination: { next_page: null } }
    });
  });

  it("throws ZodError when response shape does not match schema", async () => {
    stubAxiosWithResponse({ unexpected: "shape" });
    const schema = z.object({ storage_boxes: z.array(z.unknown()) });

    await expect(
      makeStorageBoxApiRequest("/storage_boxes", schema)
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  it("ZodError from makeStorageBoxApiRequest formats correctly through handleApiError", async () => {
    stubAxiosWithResponse({ wrong_key: 123 });
    const schema = ListStorageBoxesResponseSchema;

    let caught: unknown;
    try {
      await makeStorageBoxApiRequest("/storage_boxes", schema);
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(z.ZodError);
    const formatted = handleApiError(caught);
    expect(formatted).toContain("unexpected response shape");
    expect(formatted).toContain("storage_boxes");
  });
});

// Tests for the shared createPaginatedFetch factory (D-1 from design).
// Uses a minimal schema with meta envelope — independent of makeStorageBoxApiRequest.
describe("createPaginatedFetch", () => {
  const ItemSchema = z.object({ id: z.number() });
  const ResponseSchema = z.object({
    items: z.array(ItemSchema),
    meta: z.object({
      pagination: HetznerMetaSchema.shape.pagination
    }).optional()
  });
  type Resp = z.infer<typeof ResponseSchema>;

  function makeResp(ids: number[], nextPage: number | null): Resp {
    return {
      items: ids.map((id) => ({ id })),
      meta: { pagination: { next_page: nextPage } }
    };
  }

  const mockFn = vi.fn<Parameters<typeof makeStorageBoxApiRequest>, ReturnType<typeof makeStorageBoxApiRequest>>();
  const fetch = createPaginatedFetch(mockFn as Parameters<typeof createPaginatedFetch>[0]);

  beforeEach(() => mockFn.mockReset());

  it("returns single page when next_page is null on first response", async () => {
    mockFn.mockResolvedValueOnce(makeResp([1, 2], null) as never);

    const result = await fetch(
      "/items",
      ResponseSchema as z.ZodType<Resp>,
      (r) => r.items
    );

    expect(result.items.map((i) => i.id)).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
    expect(result.partialFailure).toBeUndefined();
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("traverses multiple pages and concatenates results in order", async () => {
    mockFn
      .mockResolvedValueOnce(makeResp([1, 2], 2) as never)
      .mockResolvedValueOnce(makeResp([3, 4], 3) as never)
      .mockResolvedValueOnce(makeResp([5], null) as never);

    const result = await fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items);

    expect(result.items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.truncated).toBe(false);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it("stops at hard cap (5 pages) and sets truncated", async () => {
    for (let i = 1; i <= 6; i++) {
      mockFn.mockResolvedValueOnce(makeResp([i], i + 1) as never);
    }

    const result = await fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items);

    expect(result.items).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(mockFn).toHaveBeenCalledTimes(5);
  });

  it("propagates first-page failure (caller should return isError: true)", async () => {
    mockFn.mockRejectedValueOnce(new Error("first-page boom") as never);

    await expect(
      fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items)
    ).rejects.toThrow("first-page boom");

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("returns partial results with partialFailure on mid-stream error", async () => {
    mockFn
      .mockResolvedValueOnce(makeResp([1, 2], 2) as never)
      .mockRejectedValueOnce(new Error("page-2 boom") as never);

    const result = await fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items);

    expect(result.items.map((i) => i.id)).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
    expect(result.partialFailure).toBeDefined();
    expect(result.partialFailure?.kind).toBe("other");
    expect(result.partialFailure?.pagesSucceeded).toBe(1);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("propagates ZodError mid-stream instead of returning partial", async () => {
    mockFn
      .mockResolvedValueOnce(makeResp([1], 2) as never)
      .mockRejectedValueOnce(new z.ZodError([
        { code: "invalid_type", path: ["items", 0, "id"], message: "expected number", input: "x", expected: "number" }
      ]) as never);

    await expect(
      fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items)
    ).rejects.toBeInstanceOf(z.ZodError);

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("forwards extraParams as query params on every page request", async () => {
    mockFn.mockResolvedValueOnce(makeResp([1], null) as never);

    await fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items, 25, { label_selector: "env=prod" });

    expect(mockFn).toHaveBeenCalledWith(
      "/items",
      expect.anything(),
      "GET",
      undefined,
      expect.objectContaining({ label_selector: "env=prod" })
    );
  });

  it("classifies axios HTTP error as 'http' kind in partialFailure", async () => {
    const httpError = Object.assign(new Error("503"), { response: { status: 503 }, isAxiosError: true });
    mockFn
      .mockResolvedValueOnce(makeResp([1], 2) as never)
      .mockRejectedValueOnce(httpError as never);

    const result = await fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items);

    expect(result.partialFailure?.kind).toBe("http");
    expect(result.partialFailure?.pagesSucceeded).toBe(1);
  });

  it("classifies axios network error as 'network' kind in partialFailure", async () => {
    const netError = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET", isAxiosError: true });
    mockFn
      .mockResolvedValueOnce(makeResp([1], 2) as never)
      .mockRejectedValueOnce(netError as never);

    const result = await fetch("/items", ResponseSchema as z.ZodType<Resp>, (r) => r.items);

    expect(result.partialFailure?.kind).toBe("network");
  });
});
