import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return { ...actual, makeApiRequest: vi.fn() };
});

import { parseFreeOutput, registerServerSshTools, runSsh } from "../../src/tools/server-ssh.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeApiRequest } from "../../src/api.js";

const mockedRequest = vi.mocked(makeApiRequest);
// Injected via dependency injection — no module mocking required.
const mockSsh = vi.fn<typeof runSsh>();

beforeEach(() => {
  mockedRequest.mockReset();
  mockSsh.mockReset();
});

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FREE_OUTPUT_NORMAL = [
  "               total        used        free      shared  buff/cache   available",
  "Mem:           31334        5540        1234         100       24560       25794",
  "Swap:              0           0           0"
].join("\n");

const FREE_OUTPUT_WITH_SWAP = [
  "               total        used        free      shared  buff/cache   available",
  "Mem:           31334       18000        2334         200       11000       13000",
  "Swap:           8192        3000        5192"
].join("\n");

const FREE_OUTPUT_NO_SWAP_LINE = [
  "               total        used        free      shared  buff/cache   available",
  "Mem:            8192        4096        1024          50        3072        4042"
].join("\n");

const serverResponse = {
  server: {
    id: 127404611,
    name: "jurislm-coolify-nbg1",
    status: "running",
    public_net: {
      ipv4: { ip: "91.99.173.93" },
      ipv6: { ip: "2a01:4f8::1" }
    },
    server_type: { id: 22, name: "cx53", description: "CX53", cores: 16, memory: 32, disk: 320 },
    datacenter: {
      id: 2,
      name: "nbg1-dc3",
      description: "Nuremberg DC Park 1",
      location: { id: 2, name: "nbg1", city: "Nuremberg", country: "DE" }
    },
    image: { id: 1, name: "ubuntu-22.04", description: "Ubuntu 22.04", os_flavor: "ubuntu", os_version: "22.04" },
    labels: {},
    created: "2024-01-01T00:00:00+00:00"
  }
};

type ToolHandler = (params: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function captureHandler(): ToolHandler {
  let captured: ToolHandler | undefined;
  const fakeServer = {
    registerTool: vi.fn((_name: string, _opts: unknown, handler: ToolHandler) => {
      captured = handler;
    })
  };
  // Inject mockSsh so the handler never opens a real SSH connection.
  registerServerSshTools(fakeServer as unknown as McpServer, mockSsh);
  return captured!;
}

// ── parseFreeOutput — pure unit tests ─────────────────────────────────────────

describe("parseFreeOutput", () => {
  it("parses normal output with swap=0 correctly", () => {
    const { ram, swap } = parseFreeOutput(FREE_OUTPUT_NORMAL);

    expect(ram.total).toBe(31334);
    expect(ram.used).toBe(5540);
    expect(ram.free).toBe(1234);
    expect(ram.available).toBe(25794);
    expect(ram.usedPercent).toBeCloseTo((5540 / 31334) * 100, 1);
    expect(swap).not.toBeNull();
    expect(swap!.total).toBe(0);
  });

  it("parses output with active swap", () => {
    const { ram, swap } = parseFreeOutput(FREE_OUTPUT_WITH_SWAP);

    expect(ram.total).toBe(31334);
    expect(ram.used).toBe(18000);
    expect(swap).not.toBeNull();
    expect(swap!.total).toBe(8192);
    expect(swap!.used).toBe(3000);
    expect(swap!.free).toBe(5192);
  });

  it("returns null swap when Swap: line is absent", () => {
    const { swap } = parseFreeOutput(FREE_OUTPUT_NO_SWAP_LINE);
    expect(swap).toBeNull();
  });

  it("usedPercent is 0 when total is 0", () => {
    const output = "Mem:              0           0           0           0           0           0";
    const { ram } = parseFreeOutput(output);
    expect(ram.usedPercent).toBe(0);
  });

  it("throws on empty / unrecognised output", () => {
    expect(() => parseFreeOutput("not valid output")).toThrow();
  });
});

// ── hetzner_get_server_ram — markdown output ──────────────────────────────────

describe("hetzner_get_server_ram — markdown", () => {
  it("returns formatted RAM stats", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_NORMAL);

    const result = await captureHandler()({ id: 127404611, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain("RAM 使用率");
    expect(text).toContain("5,540 MiB");
    expect(text).toContain("31,334 MiB");
    expect(text).toContain("17.7%");
    expect(text).toContain("25,794 MiB");
  });

  it("shows 未配置 when swap total is 0", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_NORMAL);

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.content[0].text).toContain("未配置");
  });

  it("shows swap stats when swap is active", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_WITH_SWAP);

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    const text = result.content[0].text;
    expect(text).toContain("Swap");
    expect(text).toContain("3,000 MiB");
    expect(text).toContain("8,192 MiB");
  });

  it("includes source line with resolved IP and custom SSH params", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_NORMAL);

    const result = await captureHandler()({
      id: 127404611,
      ssh_user: "ubuntu",
      ssh_port: 2222,
      response_format: "markdown"
    });

    expect(result.content[0].text).toContain("ubuntu@91.99.173.93:2222");
  });

  it("passes correct IP, port, user, and command to sshRunner", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_NORMAL);

    await captureHandler()({ id: 1, ssh_user: "ubuntu", ssh_port: 2222, response_format: "markdown" });

    expect(mockSsh).toHaveBeenCalledWith("91.99.173.93", 2222, "ubuntu", "free -m");
  });

  it("defaults ssh_user to root and ssh_port to 22", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_NORMAL);

    await captureHandler()({ id: 1, response_format: "markdown" });

    expect(mockSsh).toHaveBeenCalledWith("91.99.173.93", 22, "root", "free -m");
  });
});

// ── hetzner_get_server_ram — JSON output ──────────────────────────────────────

describe("hetzner_get_server_ram — JSON", () => {
  it("returns structured JSON with ram and swap", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockResolvedValueOnce(FREE_OUTPUT_WITH_SWAP);

    const result = await captureHandler()({ id: 127404611, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.server.ipv4).toBe("91.99.173.93");
    expect(parsed.ram.total).toBe(31334);
    expect(parsed.swap.total).toBe(8192);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("hetzner_get_server_ram — error handling", () => {
  it("returns isError when server has no IPv4", async () => {
    const noIpServer = {
      server: {
        ...serverResponse.server,
        public_net: { ipv4: null, ipv6: { ip: "2a01:4f8::1" } }
      }
    };
    mockedRequest.mockResolvedValueOnce(noIpServer);

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("no public IPv4");
  });

  it("returns SSH permission denied message", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockRejectedValueOnce(new Error("Permission denied (publickey)"));

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("permission denied");
  });

  it("returns timeout message on SSH timeout", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockRejectedValueOnce(new Error("Connection timed out"));

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");
  });

  it("returns connection refused message", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockRejectedValueOnce(new Error("Connection refused"));

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("refused");
  });

  it("returns ENOENT message when ssh binary is missing", async () => {
    mockedRequest.mockResolvedValueOnce(serverResponse);
    mockSsh.mockRejectedValueOnce(new Error("ENOENT"));

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ssh");
  });

  it("returns isError when Hetzner API fails", async () => {
    mockedRequest.mockRejectedValueOnce(new Error("network error"));

    const result = await captureHandler()({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
  });
});
