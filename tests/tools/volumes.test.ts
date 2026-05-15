import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    makeApiRequest: vi.fn()
  };
});

import { registerVolumeTools } from "../../src/tools/volumes.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeApiRequest } from "../../src/api.js";
import { HetznerVolume, ListVolumesResponse } from "../../src/types.js";

const mockedRequest = vi.mocked(makeApiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
});

const baseVolume: HetznerVolume = {
  id: 104577270,
  name: "jurislm-pgdata-nbg1",
  status: "available",
  size: 800,
  location: {
    id: 2,
    name: "nbg1",
    description: "Nuremberg DC Park 1",
    country: "DE",
    city: "Nuremberg",
    latitude: 49.452102,
    longitude: 11.076665,
    network_zone: "eu-central"
  },
  server: null,
  linux_device: "/dev/disk/by-id/scsi-0HC_Volume_104577270",
  protection: { delete: true },
  labels: {},
  format: "ext4",
  created: "2024-01-01T00:00:00+00:00"
};

function makeVolume(id: number, server: number | null = null): HetznerVolume {
  return {
    ...baseVolume,
    id,
    name: `vol-${id}`,
    server,
    linux_device: `/dev/disk/by-id/scsi-0HC_Volume_${id}`
  };
}

function pageResponse(volumes: HetznerVolume[], nextPage: number | null): ListVolumesResponse {
  return {
    volumes,
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
  registerVolumeTools(fakeServer as unknown as McpServer);
  return captured;
}

// ── hetzner_list_volumes ──────────────────────────────────────────────────────

describe("hetzner_list_volumes — auto-pagination", () => {
  it("fetches all pages and combines results", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeVolume(1), makeVolume(2)], 2))
      .mockResolvedValueOnce(pageResponse([makeVolume(3)], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 3 volume(s)");
    expect(result.content[0].text).toContain("vol-1");
    expect(result.content[0].text).toContain("vol-3");
  });

  it("returns empty message when no volumes exist", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("No volumes found");
  });

  it("shows mount path and attached server info", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeVolume(1, 42)], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.content[0].text).toContain("/dev/disk/by-id/scsi-0HC_Volume_1");
    expect(result.content[0].text).toContain("ID 42");
  });

  it("fetches a single page when page param is supplied", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeVolume(1)], 2));

    const result = await handler({ page: 1, response_format: "markdown" });

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toContain("Found 1 volume(s)");
  });

  it("forwards status and label_selector filters to API request", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeVolume(1)], null));

    await handler({ status: "available", label_selector: "env=prod", response_format: "markdown" });

    expect(mockedRequest).toHaveBeenCalledTimes(1);
    const callParams = mockedRequest.mock.calls[0][4] as Record<string, unknown>;
    expect(callParams).toMatchObject({ status: "available", label_selector: "env=prod" });
  });

  it("returns JSON when response_format is json", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeVolume(1)], null));

    const result = await handler({ response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.volumes).toHaveLength(1);
    expect(parsed.volumes[0].id).toBe(1);
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("Network error"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });

  it("throws ZodError on unexpected API shape", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_volumes")!.handler;
    mockedRequest.mockRejectedValueOnce(
      new ZodError([{ code: "invalid_type", expected: "string", received: "number", path: ["volumes", 0, "name"], message: "Expected string, received number" }])
    );

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("unexpected response shape");
  });
});

// ── hetzner_get_volume ────────────────────────────────────────────────────────

describe("hetzner_get_volume", () => {
  it("returns formatted volume details in markdown", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_get_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ volume: baseVolume });

    const result = await handler({ id: 104577270, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Volume Details");
    expect(result.content[0].text).toContain("jurislm-pgdata-nbg1");
    expect(result.content[0].text).toContain("800 GB");
    expect(result.content[0].text).toContain("/dev/disk/by-id/scsi-0HC_Volume_104577270");
  });

  it("returns raw JSON when response_format is json", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_get_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ volume: baseVolume });

    const result = await handler({ id: 104577270, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(104577270);
    expect(parsed.linux_device).toBe("/dev/disk/by-id/scsi-0HC_Volume_104577270");
  });

  it("returns isError on 404", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_get_volume")!.handler;
    const err = Object.assign(new Error("Not Found"), {
      response: { status: 404, data: {} }
    });
    mockedRequest.mockRejectedValueOnce(err);

    const result = await handler({ id: 99999, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error");
  });
});

// ── hetzner_attach_volume ─────────────────────────────────────────────────────

describe("hetzner_attach_volume", () => {
  const fakeAction = {
    id: 1,
    command: "attach_volume",
    status: "running",
    progress: 0,
    started: "2026-01-01T00:00:00+00:00",
    finished: null,
    error: null
  };

  it("returns status message on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_attach_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: fakeAction });

    const result = await handler({ id: 1, server_id: 42, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Volume 1 is being attached to server 42");
    expect(result.content[0].text).toContain("running");
  });

  it("passes automount param to API", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_attach_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: fakeAction });

    await handler({ id: 1, server_id: 42, automount: true, response_format: "markdown" });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/volumes/1/actions/attach",
      expect.anything(),
      "POST",
      { server: 42, automount: true }
    );
  });

  it("returns JSON when response_format is json", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_attach_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: fakeAction });

    const result = await handler({ id: 1, server_id: 42, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.command).toBe("attach_volume");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_attach_volume")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("conflict"));

    const result = await handler({ id: 1, server_id: 42, response_format: "markdown" });

    expect(result.isError).toBe(true);
  });
});

// ── hetzner_detach_volume ─────────────────────────────────────────────────────

describe("hetzner_detach_volume", () => {
  const fakeAction = {
    id: 2,
    command: "detach_volume",
    status: "running",
    progress: 0,
    started: "2026-01-01T00:00:00+00:00",
    finished: null,
    error: null
  };

  it("returns status message on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_detach_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: fakeAction });

    const result = await handler({ id: 5, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Volume 5 is being detached");
    expect(result.content[0].text).toContain("running");
  });

  it("returns JSON when response_format is json", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_detach_volume")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: fakeAction });

    const result = await handler({ id: 5, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.command).toBe("detach_volume");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_detach_volume")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("volume not attached"));

    const result = await handler({ id: 5, response_format: "markdown" });

    expect(result.isError).toBe(true);
  });
});
