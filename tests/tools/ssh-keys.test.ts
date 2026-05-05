import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    makeApiRequest: vi.fn()
  };
});

import { registerSSHKeyTools } from "../../src/tools/ssh-keys.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeApiRequest } from "../../src/api.js";
import { HetznerSSHKey, ListSSHKeysResponse, ListSSHKeysResponseSchema } from "../../src/types.js";

const mockedRequest = vi.mocked(makeApiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
});

const baseKey: HetznerSSHKey = {
  id: 1,
  name: "my-key",
  fingerprint: "aa:bb:cc:dd",
  public_key: "ssh-ed25519 AAAAC3Nz my-key",
  labels: {},
  created: "2026-01-01T00:00:00+00:00"
};

function makeKey(id: number): HetznerSSHKey {
  return { ...baseKey, id, name: `key-${id}` };
}

function pageResponse(keys: HetznerSSHKey[], nextPage: number | null): ListSSHKeysResponse {
  return {
    ssh_keys: keys,
    meta: { pagination: { next_page: nextPage } }
  };
}

type ToolHandler = (params: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;
interface CapturedTool {
  name: string;
  handler: ToolHandler;
  opts: { annotations?: Record<string, unknown> };
}

function captureRegisteredTools(): CapturedTool[] {
  const captured: CapturedTool[] = [];
  const fakeServer = {
    registerTool: vi.fn((name: string, opts: CapturedTool["opts"], handler: ToolHandler) => {
      captured.push({ name, handler, opts });
    })
  };
  registerSSHKeyTools(fakeServer as unknown as McpServer);
  return captured;
}

describe("hetzner_list_ssh_keys — auto-pagination", () => {
  it("fetches all pages and combines results", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeKey(1), makeKey(2)], 2))
      .mockResolvedValueOnce(pageResponse([makeKey(3)], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 3 SSH key(s)");
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("stops at hard cap and includes truncation warning", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    for (let i = 1; i <= 6; i++) {
      mockedRequest.mockResolvedValueOnce(pageResponse([makeKey(i)], i + 1));
    }

    const result = await handler({ response_format: "markdown" });

    expect(result.content[0].text).toContain("Found 5 SSH key(s)");
    expect(result.content[0].text).toContain("Truncated at 5 pages");
  });

  it("single-page mode bypasses auto-pagination", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeKey(7)], 5));

    const result = await handler({ response_format: "markdown", page: 2, per_page: 10 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 1 SSH key(s)");
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("mid-stream failure returns partial results with warning", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeKey(1)], 2))
      .mockRejectedValueOnce(new Error("page-2 down"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("key-1");
    expect(result.content[0].text).toContain("Partial result");
    expect(result.content[0].text).toContain("after 1 page(s)");
  });

  it("first-page failure returns isError: true", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("network down"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("network down");
  });
});

describe("hetzner_list_ssh_keys — edge cases", () => {
  it("empty result returns 'No SSH keys found.' message", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.content[0].text).toContain("No SSH keys found");
  });

  it("JSON format includes ssh_keys array, truncated and partialFailure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeKey(1)], null));

    const result = await handler({ response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ssh_keys).toHaveLength(1);
    expect(parsed.truncated).toBe(false);
  });

  it("propagates ZodError mid-stream as isError: true", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_ssh_keys")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeKey(1)], 2))
      .mockRejectedValueOnce(new ZodError([
        { code: "invalid_type", path: ["ssh_keys", 0, "id"], message: "expected number", input: "x", expected: "number" }
      ]));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
  });

  it("ListSSHKeysResponseSchema parses without error", () => {
    const result = ListSSHKeysResponseSchema.safeParse({
      ssh_keys: [baseKey],
      meta: { pagination: { next_page: null } }
    });
    expect(result.success).toBe(true);
  });
});
