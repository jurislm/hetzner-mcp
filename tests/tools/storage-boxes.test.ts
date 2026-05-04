import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZodError } from "zod";

vi.mock("../../src/api.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/api.js")>();
  return {
    ...actual,
    makeStorageBoxApiRequest: vi.fn()
  };
});

import {
  formatBytes,
  formatStorageBox,
  formatSubaccount,
  formatSnapshot,
  paginatedFetch,
  registerStorageBoxTools
} from "../../src/tools/storage-boxes.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { makeStorageBoxApiRequest } from "../../src/api.js";
import {
  HetznerStorageBox,
  HetznerStorageBoxSubaccount,
  HetznerStorageBoxSnapshot,
  HetznerAction,
  ListStorageBoxesResponse,
  ListStorageBoxesResponseSchema
} from "../../src/types.js";

const mockedRequest = vi.mocked(makeStorageBoxApiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
});

const baseBox: HetznerStorageBox = {
  id: 1,
  name: "test-box",
  login: "u123",
  product: "BX11",
  location: "fsn1",
  quota_bytes: 1024 ** 4,
  used_bytes: 0,
  snapshots_used_bytes: 0,
  ssh: true,
  webdav: false,
  samba: false,
  zfs: false,
  external_reachability: true,
  locked: false,
  cancelled: false,
  paid_until: null
};

const baseSubaccount: HetznerStorageBoxSubaccount = {
  username: "u123-sub1",
  home_directory: "/home/sub1",
  ssh: true,
  webdav: false,
  samba: false,
  external_reachability: false,
  readonly: false,
  comment: null
};

describe("formatBytes", () => {
  it("formats gigabyte-scale value with GiB label", () => {
    // 1024 GiB = 1024^4 bytes
    expect(formatBytes(1024 ** 4)).toBe("1024.0 GiB");
  });

  it("formats sub-gigabyte value with MiB label", () => {
    // 500 MiB = 500 * 1024^2
    expect(formatBytes(500 * 1024 ** 2)).toBe("500 MiB");
  });

  it("formats zero as 0 MiB", () => {
    expect(formatBytes(0)).toBe("0 MiB");
  });

  it("never emits the decimal GB label", () => {
    expect(formatBytes(2 * 1024 ** 3)).not.toContain(" GB");
    expect(formatBytes(2 * 1024 ** 3)).toContain(" GiB");
  });
});

describe("formatStorageBox", () => {
  it("formats paid_until as ISO date (YYYY-MM-DD), independent of locale", () => {
    const out = formatStorageBox({
      ...baseBox,
      paid_until: "2026-12-31T23:59:59+00:00"
    });
    expect(out).toContain("- **Paid until**: 2026-12-31");
  });

  it("omits the Paid until line when paid_until is null", () => {
    const out = formatStorageBox({ ...baseBox, paid_until: null });
    expect(out).not.toContain("Paid until");
  });

  it("lists only enabled protocols", () => {
    const out = formatStorageBox({
      ...baseBox,
      ssh: true,
      webdav: true,
      samba: false,
      zfs: false
    });
    expect(out).toContain("- **Protocols**: ssh, webdav");
  });

  it("renders 'none' when no protocols enabled", () => {
    const out = formatStorageBox({
      ...baseBox,
      ssh: false,
      webdav: false,
      samba: false,
      zfs: false
    });
    expect(out).toContain("- **Protocols**: none");
  });
});

describe("formatSubaccount", () => {
  it("omits Comment line when comment is null", () => {
    const out = formatSubaccount({ ...baseSubaccount, comment: null });
    expect(out).not.toContain("**Comment**");
  });

  it("omits Comment line when comment is empty string", () => {
    const out = formatSubaccount({ ...baseSubaccount, comment: "" });
    expect(out).not.toContain("**Comment**");
  });

  it("includes Comment line when comment is non-empty", () => {
    const out = formatSubaccount({ ...baseSubaccount, comment: "backup user" });
    expect(out).toContain("- **Comment**: backup user");
  });

  it("lists only enabled protocols", () => {
    const out = formatSubaccount({
      ...baseSubaccount,
      ssh: false,
      webdav: true,
      samba: true
    });
    expect(out).toContain("- **Protocols**: webdav, samba");
  });

  it("renders 'none' when no protocols enabled", () => {
    const out = formatSubaccount({
      ...baseSubaccount,
      ssh: false,
      webdav: false,
      samba: false
    });
    expect(out).toContain("- **Protocols**: none");
  });
});

function makeBox(id: number): HetznerStorageBox {
  return { ...baseBox, id, name: `box-${id}` };
}

function pageResponse(boxes: HetznerStorageBox[], nextPage: number | null): ListStorageBoxesResponse {
  return {
    storage_boxes: boxes,
    meta: {
      pagination: {
        page: 1,
        per_page: 50,
        previous_page: null,
        next_page: nextPage,
        last_page: nextPage,
        total_entries: null
      }
    }
  };
}

describe("paginatedFetch", () => {
  it("returns single page when next_page is null on first response", async () => {
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(1), makeBox(2)], null));

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.partialFailure).toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("traverses 3 pages and concatenates results in order", async () => {
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1), makeBox(2)], 2))
      .mockResolvedValueOnce(pageResponse([makeBox(3), makeBox(4)], 3))
      .mockResolvedValueOnce(pageResponse([makeBox(5)], null));

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.items.map((b) => b.id)).toEqual([1, 2, 3, 4, 5]);
    expect(result.truncated).toBe(false);
    expect(mockedRequest).toHaveBeenCalledTimes(3);
  });

  it("stops at the 5-page hard cap and sets truncated", async () => {
    // Always return next_page = current+1 so the loop would keep going forever.
    for (let i = 1; i <= 6; i++) {
      mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(i)], i + 1));
    }

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.items).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(mockedRequest).toHaveBeenCalledTimes(5);
  });

  it("treats a missing meta.pagination as end-of-stream (single page)", async () => {
    // Older API response shape with no meta — should not loop forever.
    mockedRequest.mockResolvedValueOnce({ storage_boxes: [makeBox(1)] } as ListStorageBoxesResponse);

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("propagates first-page failure (caller's catch should turn into isError)", async () => {
    mockedRequest.mockRejectedValueOnce(new Error("first-page boom"));

    await expect(
      paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>("/storage_boxes", ListStorageBoxesResponseSchema, (r) => r.storage_boxes)
    ).rejects.toThrow("first-page boom");

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("returns partial results with structured partialFailure on mid-stream failure", async () => {
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1), makeBox(2)], 2))
      .mockRejectedValueOnce(new Error("page-2 boom"));

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.items.map((b) => b.id)).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
    expect(result.partialFailure).toBeDefined();
    expect(result.partialFailure?.message).toContain("page-2 boom");
    expect(result.partialFailure?.kind).toBe("other"); // generic Error → "other"
    expect(result.partialFailure?.pagesSucceeded).toBe(1); // 1 page succeeded before page-2 failed
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("propagates ZodError mid-stream instead of returning partial (round 3 C-1)", async () => {
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1), makeBox(2)], 2))
      .mockRejectedValueOnce(new ZodError([
        { code: "invalid_type", path: ["storage_boxes", 0, "id"], message: "expected number", input: "x", expected: "number" }
      ]));

    await expect(
      paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
        "/storage_boxes",
        ListStorageBoxesResponseSchema,
        (r) => r.storage_boxes
      )
    ).rejects.toBeInstanceOf(ZodError);

    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });

  it("classifies axios HTTP error as 'http' kind in partialFailure", async () => {
    const httpError = Object.assign(new Error("503"), { response: { status: 503 }, isAxiosError: true });
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1)], 2))
      .mockRejectedValueOnce(httpError);

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.partialFailure?.kind).toBe("http");
    expect(result.partialFailure?.pagesSucceeded).toBe(1);
  });

  it("classifies axios network error as 'network' kind in partialFailure", async () => {
    const netError = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET", isAxiosError: true });
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1)], 2))
      .mockRejectedValueOnce(netError);

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      ListStorageBoxesResponseSchema,
      (r) => r.storage_boxes
    );

    expect(result.partialFailure?.kind).toBe("network");
  });
});

// I-7: Tool handler tests — exercise the registered handlers (happy path,
// error path, JSON vs markdown, partialFailure rendering).
type ToolHandler = (params: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

interface CapturedTool {
  name: string;
  handler: ToolHandler;
  opts: { annotations?: Record<string, unknown>; description?: string };
}

function captureRegisteredTools(): CapturedTool[] {
  const captured: CapturedTool[] = [];
  const fakeServer = {
    registerTool: vi.fn(
      (name: string, opts: CapturedTool["opts"], handler: ToolHandler) => {
        captured.push({ name, handler, opts });
      }
    )
  };
  registerStorageBoxTools(fakeServer as unknown as McpServer);
  return captured;
}

describe("registerStorageBoxTools — handler integration (I-7)", () => {
  it("registers exactly 6 tools with the expected names", () => {
    const tools = captureRegisteredTools();
    expect(tools.map((t) => t.name)).toEqual([
      "hetzner_list_storage_boxes",
      "hetzner_get_storage_box",
      "hetzner_list_storage_box_subaccounts",
      "hetzner_list_storage_box_snapshots",
      "hetzner_create_storage_box_snapshot",
      "hetzner_rollback_storage_box_snapshot"
    ]);
  });

  it("hetzner_list_storage_boxes returns markdown with formatted boxes on happy path", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(1), makeBox(2)], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Storage Boxes");
    expect(result.content[0].text).toContain("Found 2 storage box(es)");
    expect(result.content[0].text).toContain("box-1");
    expect(result.content[0].text).toContain("box-2");
  });

  it("hetzner_list_storage_boxes returns isError: true on first-page failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("network down"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("network down");
  });

  it("hetzner_list_storage_boxes renders structured partialFailure in markdown", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1)], 2))
      .mockRejectedValueOnce(new Error("page-2 down"));

    const result = await handler({ response_format: "markdown" });

    expect(result.isError).toBeUndefined(); // partial success, not an error
    expect(result.content[0].text).toContain("box-1");
    expect(result.content[0].text).toContain("Partial result");
    expect(result.content[0].text).toContain("after 1 page(s)");
    expect(result.content[0].text).toContain("(other)");
  });

  it("hetzner_list_storage_boxes JSON format includes truncated and partialFailure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(1)], null));

    const result = await handler({ response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.storage_boxes).toHaveLength(1);
    expect(parsed.truncated).toBe(false);
  });

  it("hetzner_list_storage_boxes empty result returns 'No Storage Boxes found.'", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([], null));

    const result = await handler({ response_format: "markdown" });

    expect(result.content[0].text).toBe("No Storage Boxes found.");
  });

  it("hetzner_list_storage_boxes single-page mode bypasses paginatedFetch loop", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    // Fixture has next_page: 5 but single-page mode should ignore it.
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(7)], 5));

    const result = await handler({ response_format: "markdown", page: 2, per_page: 25 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Found 1 storage box(es)");
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("hetzner_get_storage_box returns markdown for one box", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_get_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ storage_box: makeBox(99) });

    const result = await handler({ id: 99, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Storage Box Details");
    expect(result.content[0].text).toContain("box-99");
  });

  it("hetzner_get_storage_box returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_get_storage_box")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 99, response_format: "markdown" });

    expect(result.isError).toBe(true);
  });

  it("hetzner_list_storage_box_subaccounts empty result returns id-specific message", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_subaccounts")!.handler;
    mockedRequest.mockResolvedValueOnce({
      subaccounts: [],
      meta: { pagination: { next_page: null } }
    });

    const result = await handler({ id: 42, response_format: "markdown" });

    expect(result.content[0].text).toBe("No subaccounts found for Storage Box 42.");
  });
});

const baseSnapshot: HetznerStorageBoxSnapshot = {
  id: 100,
  name: "snap-100",
  description: null,
  stats: { size: 5 * 1024 ** 3 },
  is_automatic: false,
  storage_box: 1,
  created: "2026-05-01T10:00:00+00:00"
};

const baseAction: HetznerAction = {
  id: 9001,
  command: "create_storage_box_snapshot",
  status: "running",
  progress: 0,
  started: "2026-05-01T10:00:00+00:00",
  finished: null,
  error: null
};

describe("formatSnapshot", () => {
  it("includes core fields and formatted size", () => {
    const out = formatSnapshot(baseSnapshot);
    expect(out).toContain("snap-100 (ID: 100)");
    expect(out).toContain("- **Created**: 2026-05-01");
    expect(out).not.toContain("T10:00:00");
    expect(out).toContain("- **Size**: 5.0 GiB");
    expect(out).toContain("- **Automatic**: no");
  });

  it("omits description line when null", () => {
    const out = formatSnapshot({ ...baseSnapshot, description: null });
    expect(out).not.toContain("Description");
  });

  it("includes description line when present", () => {
    const out = formatSnapshot({ ...baseSnapshot, description: "pre-migration" });
    expect(out).toContain("- **Description**: pre-migration");
  });
});

describe("hetzner_list_storage_box_snapshots handler", () => {
  it("returns markdown with formatted snapshots on happy path", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_snapshots")!.handler;
    mockedRequest.mockResolvedValueOnce({
      snapshots: [baseSnapshot, { ...baseSnapshot, id: 101, name: "snap-101" }],
      meta: { pagination: { next_page: null } }
    });

    const result = await handler({ id: 1, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("# Snapshots for Storage Box 1");
    expect(result.content[0].text).toContain("Found 2 snapshot(s)");
    expect(result.content[0].text).toContain("snap-100");
    expect(result.content[0].text).toContain("snap-101");
  });

  it("returns id-specific empty message when none", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_snapshots")!.handler;
    mockedRequest.mockResolvedValueOnce({
      snapshots: [],
      meta: { pagination: { next_page: null } }
    });

    const result = await handler({ id: 42, response_format: "markdown" });

    expect(result.content[0].text).toBe("No snapshots found for Storage Box 42.");
  });

  it("propagates 404 as isError", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_snapshots")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 99, response_format: "markdown" });

    expect(result.isError).toBe(true);
  });

  it("single-page mode bypasses pagination loop", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_snapshots")!.handler;
    mockedRequest.mockResolvedValueOnce({
      snapshots: [baseSnapshot],
      meta: { pagination: { next_page: 5 } }
    });

    const result = await handler({ id: 1, response_format: "markdown", page: 2, per_page: 25 });

    expect(result.isError).toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });
});

describe("hetzner_create_storage_box_snapshot handler", () => {
  it("posts description+labels and returns markdown with snapshot+action", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce({
      snapshot: { ...baseSnapshot, description: "pre-migration" },
      action: baseAction
    });

    const result = await handler({
      id: 1,
      description: "pre-migration",
      labels: { env: "dev" },
      response_format: "markdown"
    });

    expect(result.isError).toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledWith(
      "/storage_boxes/1/snapshots",
      expect.anything(),
      "POST",
      { description: "pre-migration", labels: { env: "dev" } }
    );
    expect(result.content[0].text).toContain("# Snapshot Created for Storage Box 1");
    expect(result.content[0].text).toContain("snap-100");
    expect(result.content[0].text).toContain("create_storage_box_snapshot");
  });

  it("posts empty body when no description/labels supplied", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce({ snapshot: baseSnapshot, action: baseAction });

    await handler({ id: 1, response_format: "markdown" });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/storage_boxes/1/snapshots",
      expect.anything(),
      "POST",
      {}
    );
  });

  it("returns isError when API returns 422", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_snapshot")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("snapshot quota exceeded"));

    const result = await handler({ id: 1, response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("snapshot quota exceeded");
  });

  it("JSON format returns raw {snapshot, action}", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce({ snapshot: baseSnapshot, action: baseAction });

    const result = await handler({ id: 1, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.snapshot.id).toBe(100);
    expect(parsed.action.id).toBe(9001);
  });
});

describe("hetzner_rollback_storage_box_snapshot handler", () => {
  it("posts snapshot field (NOT snapshot_id) for rollback by id", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_rollback_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce({
      action: { ...baseAction, command: "rollback_storage_box_snapshot" }
    });

    await handler({ id: 1, snapshot: "12345", response_format: "markdown" });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/storage_boxes/1/actions/rollback_snapshot",
      expect.anything(),
      "POST",
      { snapshot: "12345" }
    );
  });

  it("forwards snapshot name verbatim", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_rollback_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce({
      action: { ...baseAction, command: "rollback_storage_box_snapshot" }
    });

    const result = await handler({
      id: 1,
      snapshot: "pre-migration-backup",
      response_format: "markdown"
    });

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      "POST",
      { snapshot: "pre-migration-backup" }
    );
    expect(result.content[0].text).toContain("pre-migration-backup");
  });

  it("JSON format returns action envelope", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_rollback_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce({
      action: { ...baseAction, command: "rollback_storage_box_snapshot" }
    });

    const result = await handler({ id: 1, snapshot: "snap-name", response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.action.command).toBe("rollback_storage_box_snapshot");
    expect(parsed.action.id).toBe(9001);
  });

  it("declares destructiveHint: true and idempotentHint: false", () => {
    const tools = captureRegisteredTools();
    const tool = tools.find((t) => t.name === "hetzner_rollback_storage_box_snapshot")!;
    expect(tool.opts.annotations?.destructiveHint).toBe(true);
    expect(tool.opts.annotations?.idempotentHint).toBe(false);
    expect(tool.opts.annotations?.readOnlyHint).toBe(false);
    expect(tool.opts.description).toMatch(/destructive/i);
    expect(tool.opts.description).toMatch(/overwrite/i);
  });
});
