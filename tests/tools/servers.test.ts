import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    makeApiRequest: vi.fn()
  };
});

import { registerServerTools } from "../../src/tools/servers.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeApiRequest } from "../../src/api.js";
import { HetznerServer, ListServersResponse, ListServersResponseSchema } from "../../src/types.js";

const mockedRequest = vi.mocked(makeApiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
});

const baseServer: HetznerServer = {
  id: 1,
  name: "test-server",
  status: "running",
  public_net: {
    ipv4: { ip: "1.2.3.4" },
    ipv6: { ip: "2001:db8::1" }
  },
  server_type: { id: 1, name: "cx22", description: "CX22", cores: 2, memory: 4, disk: 40 },
  datacenter: {
    id: 1,
    name: "fsn1-dc14",
    description: "Falkenstein DC Park 1",
    location: { id: 1, name: "fsn1", city: "Falkenstein", country: "DE" }
  },
  image: { id: 1, name: "ubuntu-24.04", description: "Ubuntu 24.04", os_flavor: "ubuntu", os_version: "24.04" },
  labels: {},
  created: "2026-01-01T00:00:00+00:00"
};

function makeServer(id: number): HetznerServer {
  return { ...baseServer, id, name: `server-${id}` };
}

function pageResponse(servers: HetznerServer[], nextPage: number | null): ListServersResponse {
  return {
    servers,
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
  registerServerTools(fakeServer as unknown as McpServer);
  return captured;
}

describe("hetzner_list_servers — auto-pagination", () => {
  it("fetches all pages and combines results", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeServer(1), makeServer(2)], 2))
      .mockResolvedValueOnce(pageResponse([makeServer(3)], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 3 server(s)");
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("stops at hard cap and includes truncation warning", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    for (let i = 1; i <= 6; i++) {
      mockedRequest.mockResolvedValueOnce(pageResponse([makeServer(i)], i + 1));
    }

    const result = await handler({ response_format: "markdown" });

    expect(result.content[0].text).toContain("Found 5 server(s)");
    expect(result.content[0].text).toContain("Truncated at 5 pages");
  });

  it("single-page mode bypasses auto-pagination", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeServer(7)], 5));

    const result = await handler({ response_format: "markdown", page: 2, per_page: 10 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 1 server(s)");
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("mid-stream failure returns partial results with warning", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeServer(1)], 2))
      .mockRejectedValueOnce(new Error("page-2 down"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("server-1");
    expect(result.content[0].text).toContain("Partial result");
    expect(result.content[0].text).toContain("after 1 page(s)");
  });

  it("first-page failure returns isError: true", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("network down"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("network down");
  });
});

describe("hetzner_list_servers — edge cases", () => {
  it("empty result returns 'No servers found.' message", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.content[0].text).toContain("No servers found");
  });

  it("JSON format includes servers array, truncated and partialFailure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeServer(1)], null));

    const result = await handler({ response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.servers).toHaveLength(1);
    expect(parsed.truncated).toBe(false);
  });

  it("propagates ZodError mid-stream as isError: true", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_servers")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeServer(1)], 2))
      .mockRejectedValueOnce(new ZodError([
        { code: "invalid_type", path: ["servers", 0, "id"], message: "expected number", input: "x", expected: "number" }
      ]));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
  });

  it("ListServersResponseSchema parses without error", () => {
    const result = ListServersResponseSchema.safeParse({ servers: [baseServer], meta: { pagination: { next_page: null } } });
    expect(result.success).toBe(true);
  });
});
