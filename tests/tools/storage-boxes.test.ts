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
  formatAction,
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
  username: "u123",
  status: "active",
  server: "u123.your-storagebox.de",
  system: "FSN1-BX355",
  storage_box_type: { id: 1, name: "bx11", description: "BX11", size: 1099511627776 },
  location: { id: 3, name: "fsn1", description: "Falkenstein DC Park 1", country: "DE", city: "Falkenstein" },
  labels: {},
  protection: { delete: false },
  access_settings: {
    reachable_externally: true,
    ssh_enabled: true,
    webdav_enabled: false,
    samba_enabled: false,
    zfs_enabled: false
  },
  stats: { size: 1024 ** 4, size_data: 0, size_snapshots: 0 },
  snapshot_plan: null,
  created: "2026-01-01T00:00:00+00:00"
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
  it("includes username, status, type, location, and server", () => {
    const out = formatStorageBox(baseBox);
    expect(out).toContain("- **Username**: u123");
    expect(out).toContain("- **Status**: active");
    expect(out).toContain("- **Type**: bx11");
    expect(out).toContain("- **Location**: fsn1");
    expect(out).toContain("- **Server**: u123.your-storagebox.de");
  });

  it("renders em-dash when server is null (initializing)", () => {
    const out = formatStorageBox({ ...baseBox, server: null, system: null });
    expect(out).toContain("- **Server**: —");
  });

  it("shows storage used from stats.size_data and total from storage_box_type.size", () => {
    // stats.size (2 TiB) differs from storage_box_type.size (1 TiB) to prove
    // the total comes from storage_box_type.size, not stats.size.
    const out = formatStorageBox({
      ...baseBox,
      stats: { size: 2 * 1024 ** 4, size_data: 512 * 1024 ** 3, size_snapshots: 0 }
    });
    expect(out).toContain("512.0 GiB used / 1024.0 GiB total (~50% used)");
  });

  it("shows rounded percentage usage in storage line", () => {
    // 509185359872 bytes used out of 1099511627776 bytes total ≈ 46%
    const out = formatStorageBox({
      ...baseBox,
      stats: { size: 509185359872, size_data: 509185359872, size_snapshots: 0 },
      storage_box_type: { ...baseBox.storage_box_type, size: 1099511627776 }
    });
    expect(out).toContain("(~46% used)");
  });

  it("shows 0% when storage_box_type.size is zero to avoid division by zero", () => {
    const out = formatStorageBox({
      ...baseBox,
      stats: { size: 0, size_data: 0, size_snapshots: 0 },
      storage_box_type: { ...baseBox.storage_box_type, size: 0 }
    });
    expect(out).toContain("(~0% used)");
    expect(out).not.toContain("Infinity");
    expect(out).not.toContain("NaN");
  });

  it("shows snapshot usage from stats.size_snapshots", () => {
    const out = formatStorageBox({
      ...baseBox,
      stats: { size: 1024 ** 4, size_data: 0, size_snapshots: 5 * 1024 ** 3 }
    });
    expect(out).toContain("- **Snapshots**: 5.0 GiB");
  });

  it("lists only enabled protocols from access_settings", () => {
    const out = formatStorageBox({
      ...baseBox,
      access_settings: {
        ...baseBox.access_settings,
        ssh_enabled: true,
        webdav_enabled: true,
        samba_enabled: false,
        zfs_enabled: false
      }
    });
    expect(out).toContain("- **Protocols**: ssh, webdav");
  });

  it("renders 'none' when no protocols are enabled", () => {
    const out = formatStorageBox({
      ...baseBox,
      access_settings: {
        ...baseBox.access_settings,
        ssh_enabled: false,
        webdav_enabled: false,
        samba_enabled: false,
        zfs_enabled: false
      }
    });
    expect(out).toContain("- **Protocols**: none");
  });

  it("shows external reachability from access_settings.reachable_externally", () => {
    const out = formatStorageBox({
      ...baseBox,
      access_settings: { ...baseBox.access_settings, reachable_externally: false }
    });
    expect(out).toContain("- **External reachability**: no");
  });

  it("shows delete protection status from protection.delete", () => {
    const out = formatStorageBox({
      ...baseBox,
      protection: { delete: true }
    });
    expect(out).toContain("- **Delete protected**: yes");
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

function pageResponse(
  boxes: HetznerStorageBox[],
  nextPage: number | null,
  lastPage: number | null = null
): ListStorageBoxesResponse {
  return {
    storage_boxes: boxes,
    meta: {
      pagination: {
        page: 1,
        per_page: 50,
        previous_page: null,
        next_page: nextPage,
        last_page: lastPage,
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
  it("registers exactly 20 tools with the expected names", () => {
    const tools = captureRegisteredTools();
    expect(tools.map((t) => t.name)).toEqual([
      "hetzner_list_storage_boxes",
      "hetzner_get_storage_box",
      "hetzner_list_storage_box_subaccounts",
      "hetzner_list_storage_box_snapshots",
      "hetzner_create_storage_box_snapshot",
      "hetzner_create_storage_box",
      "hetzner_update_storage_box",
      "hetzner_delete_storage_box",
      "hetzner_list_storage_box_folders",
      "hetzner_create_storage_box_subaccount",
      "hetzner_update_storage_box_subaccount",
      "hetzner_delete_storage_box_subaccount",
      "hetzner_delete_storage_box_snapshot",
      "hetzner_change_storage_box_protection",
      "hetzner_change_storage_box_type",
      "hetzner_reset_storage_box_password",
      "hetzner_update_storage_box_access_settings",
      "hetzner_enable_storage_box_snapshot_plan",
      "hetzner_disable_storage_box_snapshot_plan",
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

  it("hetzner_get_storage_box JSON format returns raw storage_box object", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_get_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ storage_box: makeBox(99) });

    const result = await handler({ id: 99, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(99);
    expect(parsed.name).toBe("box-99");
  });

  it("hetzner_list_storage_box_subaccounts single-page mode bypasses pagination loop", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_subaccounts")!.handler;
    mockedRequest.mockResolvedValueOnce({
      subaccounts: [baseSubaccount],
      meta: { pagination: { next_page: 5 } }
    });

    const result = await handler({ id: 1, response_format: "markdown", page: 2, per_page: 25 });

    expect(result.isError).toBeUndefined();
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("hetzner_list_storage_box_subaccounts JSON format includes truncated and partialFailure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_subaccounts")!.handler;
    mockedRequest.mockResolvedValueOnce({
      subaccounts: [baseSubaccount],
      meta: { pagination: { next_page: null } }
    });

    const result = await handler({ id: 1, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.subaccounts).toHaveLength(1);
    expect(parsed.truncated).toBe(false);
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

  it("hetzner_list_storage_boxes forwards label_selector as query param", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(1)], null));

    await handler({ response_format: "markdown", label_selector: "env=prod" });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/storage_boxes",
      expect.anything(),
      "GET",
      undefined,
      expect.objectContaining({ label_selector: "env=prod" })
    );
  });

  it("hetzner_list_storage_boxes forwards name as query param", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(1)], null));

    await handler({ response_format: "markdown", name: "my-box" });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/storage_boxes",
      expect.anything(),
      "GET",
      undefined,
      expect.objectContaining({ name: "my-box" })
    );
  });

  it("hetzner_list_storage_boxes without filters does not send label_selector or name", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_boxes")!.handler;
    mockedRequest.mockResolvedValueOnce(pageResponse([makeBox(1)], null));

    await handler({ response_format: "markdown" });

    const callParams = (mockedRequest.mock.calls[0] as unknown[])[4] as Record<string, unknown>;
    expect(callParams).not.toHaveProperty("label_selector");
    expect(callParams).not.toHaveProperty("name");
  });

  it("hetzner_list_storage_box_subaccounts forwards username as query param", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_subaccounts")!.handler;
    mockedRequest.mockResolvedValueOnce({
      subaccounts: [baseSubaccount],
      meta: { pagination: { next_page: null } }
    });

    await handler({ id: 42, response_format: "markdown", username: "u123-sub1" });

    expect(mockedRequest).toHaveBeenCalledWith(
      "/storage_boxes/42/subaccounts",
      expect.anything(),
      "GET",
      undefined,
      expect.objectContaining({ username: "u123-sub1" })
    );
  });

  it("hetzner_list_storage_box_subaccounts without username returns all subaccounts", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_subaccounts")!.handler;
    mockedRequest.mockResolvedValueOnce({
      subaccounts: [baseSubaccount],
      meta: { pagination: { next_page: null } }
    });

    const result = await handler({ id: 1, response_format: "markdown" });

    const callParams = (mockedRequest.mock.calls[0] as unknown[])[4] as Record<string, unknown>;
    expect(callParams).not.toHaveProperty("username");
    expect(result.content[0].text).toContain("Found 1 subaccount(s)");
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

  it("omits Labels line when labels is undefined or empty", () => {
    expect(formatSnapshot({ ...baseSnapshot, labels: undefined })).not.toContain("Labels");
    expect(formatSnapshot({ ...baseSnapshot, labels: {} })).not.toContain("Labels");
  });

  it("renders Labels as key=value, comma-separated when present", () => {
    const out = formatSnapshot({
      ...baseSnapshot,
      labels: { env: "prod", team: "data" }
    });
    expect(out).toContain("- **Labels**: env=prod, team=data");
  });
});

describe("formatAction", () => {
  it("includes core fields and progress percentage", () => {
    const out = formatAction(baseAction);
    expect(out).toContain("- **Action ID**: 9001");
    expect(out).toContain("- **Command**: create_storage_box_snapshot");
    expect(out).toContain("- **Status**: running");
    expect(out).toContain("- **Progress**: 0%");
  });

  it("omits error line when error is null", () => {
    const out = formatAction(baseAction);
    expect(out).not.toContain("Error");
  });

  it("includes error line when error is present", () => {
    const out = formatAction({
      ...baseAction,
      status: "error",
      error: { code: "action_failed", message: "snapshot quota exceeded" }
    });
    expect(out).toContain("- **Error**: action_failed — snapshot quota exceeded");
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

  it("JSON format includes snapshots array, truncated and partialFailure fields", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_snapshots")!.handler;
    mockedRequest.mockResolvedValueOnce({
      snapshots: [baseSnapshot],
      meta: { pagination: { next_page: null } }
    });

    const result = await handler({ id: 1, response_format: "json" });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.snapshots).toHaveLength(1);
    expect(parsed.snapshots[0].id).toBe(100);
    expect(parsed.truncated).toBe(false);
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

  it("returns isError when API returns an error", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_rollback_storage_box_snapshot")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("rollback failed"));

    const result = await handler({ id: 1, snapshot: "snap-name", response_format: "markdown" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("rollback failed");
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

describe("hetzner_create_storage_box", () => {
  it("returns markdown with box and action on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ storage_box: baseBox, action: baseAction });

    const result = await handler({
      storage_box_type: "bx11",
      location: "fsn1",
      name: "new-box",
      password: "TestP@ss123!",
      response_format: "markdown"
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Storage Box Created");
    expect(result.content[0].text).toContain("Provisioning Action");
  });

  it("returns JSON on success with json format", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ storage_box: baseBox, action: baseAction });

    const result = await handler({
      storage_box_type: "bx11",
      location: "fsn1",
      name: "new-box",
      password: "TestP@ss123!",
      response_format: "json"
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.storage_box).toBeDefined();
    expect(parsed.action).toBeDefined();
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("invalid type"));

    const result = await handler({
      storage_box_type: "invalid",
      location: "fsn1",
      name: "bad",
      password: "TestP@ss123!",
      response_format: "markdown"
    });

    expect(result.isError).toBe(true);
  });

  it("description warns about cost", () => {
    const tools = captureRegisteredTools();
    const tool = tools.find((t) => t.name === "hetzner_create_storage_box")!;
    expect(tool.opts.description).toMatch(/costs?/i);
  });
});

describe("hetzner_update_storage_box", () => {
  it("returns markdown with updated box on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ storage_box: { ...baseBox, name: "renamed-box" } });

    const result = await handler({ id: 1, name: "renamed-box", response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Storage Box Updated");
    expect(result.content[0].text).toContain("renamed-box");
  });

  it("returns JSON format on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ storage_box: baseBox });

    const result = await handler({ id: 1, name: "box", response_format: "json" });

    expect(JSON.parse(result.content[0].text).id).toBe(1);
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999, name: "x", response_format: "markdown" });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_delete_storage_box", () => {
  it("returns action status on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_delete_storage_box")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "delete" } });

    const result = await handler({ id: 1 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("being deleted");
    expect(result.content[0].text).toContain("running");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_delete_storage_box")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999 });
    expect(result.isError).toBe(true);
  });

  it("declares destructiveHint: true", () => {
    const tools = captureRegisteredTools();
    const tool = tools.find((t) => t.name === "hetzner_delete_storage_box")!;
    expect(tool.opts.annotations?.destructiveHint).toBe(true);
  });
});

describe("hetzner_list_storage_box_folders", () => {
  it("returns folder list in markdown on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_folders")!.handler;
    mockedRequest.mockResolvedValueOnce({ folders: ["backup", ".ssh"] });

    const result = await handler({ id: 1, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("backup");
    expect(result.content[0].text).toContain(".ssh");
  });

  it("returns empty-state message when no folders", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_folders")!.handler;
    mockedRequest.mockResolvedValueOnce({ folders: [] });

    const result = await handler({ id: 1, response_format: "markdown" });
    expect(result.content[0].text).toContain("No folders");
  });

  it("returns JSON format", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_folders")!.handler;
    mockedRequest.mockResolvedValueOnce({ folders: ["data"] });

    const result = await handler({ id: 1, response_format: "json" });
    expect(JSON.parse(result.content[0].text).folders).toEqual(["data"]);
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_list_storage_box_folders")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999, response_format: "markdown" });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_create_storage_box_subaccount", () => {
  it("returns markdown with subaccount on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_subaccount")!.handler;
    mockedRequest.mockResolvedValueOnce({ subaccount: baseSubaccount });

    const result = await handler({ id: 1, response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Subaccount Created");
    expect(result.content[0].text).toContain("u123-sub1");
  });

  it("returns JSON format", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_subaccount")!.handler;
    mockedRequest.mockResolvedValueOnce({ subaccount: baseSubaccount });

    const result = await handler({ id: 1, response_format: "json" });
    expect(JSON.parse(result.content[0].text).username).toBe("u123-sub1");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_create_storage_box_subaccount")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999, response_format: "markdown" });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_update_storage_box_subaccount", () => {
  it("returns markdown with updated subaccount on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box_subaccount")!.handler;
    mockedRequest.mockResolvedValueOnce({ subaccount: { ...baseSubaccount, comment: "updated" } });

    const result = await handler({ id: 1, username: "u123-sub1", comment: "updated", response_format: "markdown" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Subaccount Updated");
    expect(result.content[0].text).toContain("u123-sub1");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box_subaccount")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 1, username: "ghost", response_format: "markdown" });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_delete_storage_box_subaccount", () => {
  it("returns confirmation message on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_delete_storage_box_subaccount")!.handler;
    mockedRequest.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 1, username: "u123-sub1" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("u123-sub1");
    expect(result.content[0].text).toContain("deleted");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_delete_storage_box_subaccount")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 1, username: "ghost" });
    expect(result.isError).toBe(true);
  });

  it("declares destructiveHint: true", () => {
    const tools = captureRegisteredTools();
    const tool = tools.find((t) => t.name === "hetzner_delete_storage_box_subaccount")!;
    expect(tool.opts.annotations?.destructiveHint).toBe(true);
  });
});

describe("hetzner_delete_storage_box_snapshot", () => {
  it("returns confirmation message on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_delete_storage_box_snapshot")!.handler;
    mockedRequest.mockResolvedValueOnce(undefined);

    const result = await handler({ id: 1, snapshot_id: "my-snap" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("my-snap");
    expect(result.content[0].text).toContain("deleted");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_delete_storage_box_snapshot")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 1, snapshot_id: "ghost-snap" });
    expect(result.isError).toBe(true);
  });

  it("declares destructiveHint: true", () => {
    const tools = captureRegisteredTools();
    const tool = tools.find((t) => t.name === "hetzner_delete_storage_box_snapshot")!;
    expect(tool.opts.annotations?.destructiveHint).toBe(true);
  });
});

describe("hetzner_change_storage_box_protection", () => {
  it("returns enabled confirmation on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_change_storage_box_protection")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "change_protection" } });

    const result = await handler({ id: 1, delete: true });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("enabled");
  });

  it("returns disabled confirmation when delete=false", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_change_storage_box_protection")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: baseAction });

    const result = await handler({ id: 1, delete: false });
    expect(result.content[0].text).toContain("disabled");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_change_storage_box_protection")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999, delete: true });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_change_storage_box_type", () => {
  it("returns action status on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_change_storage_box_type")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "change_type" } });

    const result = await handler({ id: 1, storage_box_type: "bx20" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("bx20");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_change_storage_box_type")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("invalid type"));

    const result = await handler({ id: 1, storage_box_type: "invalid" });
    expect(result.isError).toBe(true);
  });

  it("declares destructiveHint: true", () => {
    const tools = captureRegisteredTools();
    const tool = tools.find((t) => t.name === "hetzner_change_storage_box_type")!;
    expect(tool.opts.annotations?.destructiveHint).toBe(true);
  });
});

describe("hetzner_reset_storage_box_password", () => {
  it("returns action status on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_reset_storage_box_password")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "reset_password" } });

    const result = await handler({ id: 1, password: "NewP@ss123!" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Password reset");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_reset_storage_box_password")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999, password: "NewP@ss123!" });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_update_storage_box_access_settings", () => {
  it("returns action status on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box_access_settings")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "update_access_settings" } });

    const result = await handler({ id: 1, ssh_enabled: false, samba_enabled: false });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Access settings updated");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_update_storage_box_access_settings")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999 });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_enable_storage_box_snapshot_plan", () => {
  it("returns action status on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_enable_storage_box_snapshot_plan")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "enable_snapshot_plan" } });

    const result = await handler({ id: 1, hour: 3, minute: 0, day_of_week: null, day_of_month: null });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Snapshot plan enabled");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_enable_storage_box_snapshot_plan")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999, hour: 3, minute: 0, day_of_week: null, day_of_month: null });
    expect(result.isError).toBe(true);
  });
});

describe("hetzner_disable_storage_box_snapshot_plan", () => {
  it("returns action status on success", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_disable_storage_box_snapshot_plan")!.handler;
    mockedRequest.mockResolvedValueOnce({ action: { ...baseAction, command: "disable_snapshot_plan" } });

    const result = await handler({ id: 1 });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Snapshot plan disabled");
  });

  it("returns isError on API failure", async () => {
    const tools = captureRegisteredTools();
    const handler = tools.find((t) => t.name === "hetzner_disable_storage_box_snapshot_plan")!.handler;
    mockedRequest.mockRejectedValueOnce(new Error("not found"));

    const result = await handler({ id: 9999 });
    expect(result.isError).toBe(true);
  });
});
