import { describe, it, expect, vi, beforeEach } from "vitest";

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
  paginatedFetch
} from "../../src/tools/storage-boxes.js";
import { makeStorageBoxApiRequest } from "../../src/api.js";
import {
  HetznerStorageBox,
  HetznerStorageBoxSubaccount,
  ListStorageBoxesResponse
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
      (r) => r.storage_boxes
    );

    expect(result.items).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("propagates first-page failure (caller's catch should turn into isError)", async () => {
    mockedRequest.mockRejectedValueOnce(new Error("first-page boom"));

    await expect(
      paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>("/storage_boxes", (r) => r.storage_boxes)
    ).rejects.toThrow("first-page boom");

    expect(mockedRequest).toHaveBeenCalledTimes(1);
  });

  it("returns partial results with partialFailure on mid-stream failure", async () => {
    mockedRequest
      .mockResolvedValueOnce(pageResponse([makeBox(1), makeBox(2)], 2))
      .mockRejectedValueOnce(new Error("page-2 boom"));

    const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
      "/storage_boxes",
      (r) => r.storage_boxes
    );

    expect(result.items.map((b) => b.id)).toEqual([1, 2]);
    expect(result.truncated).toBe(false);
    expect(result.partialFailure).toBeDefined();
    expect(result.partialFailure).toContain("page-2 boom");
    expect(mockedRequest).toHaveBeenCalledTimes(2);
  });
});
