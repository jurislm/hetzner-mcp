import { describe, it, expect } from "vitest";
import {
  HetznerStorageBoxSchema,
  HetznerStorageBoxSubaccountSchema,
  HetznerPaginationSchema,
  ListStorageBoxesResponseSchema,
  GetStorageBoxResponseSchema,
  ListStorageBoxSubaccountsResponseSchema
} from "../src/types.js";

// Matches the shape returned by GET /v1/storage_boxes as documented at
// https://docs.hetzner.cloud/reference/hetzner (verified 2026-05-05, issue #13).
const validBox = {
  id: 1,
  name: "test-box",
  username: "u123",
  status: "active",
  server: "u123.your-storagebox.de",
  system: "FSN1-BX355",
  storage_box_type: {
    id: 1,
    name: "bx11",
    description: "BX11",
    snapshot_limit: 10,
    automatic_snapshot_limit: 10,
    subaccounts_limit: 200,
    size: 1099511627776
  },
  location: {
    id: 3,
    name: "fsn1",
    description: "Falkenstein DC Park 1",
    country: "DE",
    city: "Falkenstein",
    latitude: 50.47612,
    longitude: 12.370071,
    network_zone: "eu-central"
  },
  labels: {},
  protection: { delete: false },
  access_settings: {
    reachable_externally: true,
    ssh_enabled: true,
    webdav_enabled: false,
    samba_enabled: false,
    zfs_enabled: false
  },
  stats: {
    size: 1099511627776,
    size_data: 0,
    size_snapshots: 0
  },
  snapshot_plan: null,
  created: "2026-01-01T00:00:00+00:00"
};

const validSubaccount = {
  username: "u123-sub1",
  home_directory: "/home/sub1",
  ssh: true,
  webdav: false,
  samba: false,
  external_reachability: false,
  readonly: false,
  comment: null
};

const validPagination = {
  page: 1,
  per_page: 50,
  previous_page: null,
  next_page: 2,
  last_page: 5,
  total_entries: 240
};

describe("HetznerStorageBoxSchema", () => {
  it("parses a valid storage box", () => {
    const parsed = HetznerStorageBoxSchema.parse(validBox);
    expect(parsed.id).toBe(validBox.id);
    expect(parsed.username).toBe(validBox.username);
    expect(parsed.status).toBe(validBox.status);
  });

  it("rejects when username is missing (old API used 'login')", () => {
    const { username: _omit, ...rest } = validBox;
    void _omit;
    const result = HetznerStorageBoxSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("username");
    }
  });

  it("rejects when stats.size is a string (type coercion guard)", () => {
    const result = HetznerStorageBoxSchema.safeParse({
      ...validBox,
      stats: { ...validBox.stats, size: "1099511627776" }
    });
    expect(result.success).toBe(false);
  });

  it("rejects when access_settings is missing entirely", () => {
    const { access_settings: _omit, ...rest } = validBox;
    void _omit;
    const result = HetznerStorageBoxSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts snapshot_plan as null (no plan configured)", () => {
    const result = HetznerStorageBoxSchema.safeParse({
      ...validBox,
      snapshot_plan: null
    });
    expect(result.success).toBe(true);
  });

  it("accepts snapshot_plan as a configured schedule object", () => {
    const result = HetznerStorageBoxSchema.safeParse({
      ...validBox,
      snapshot_plan: { max_snapshots: 7, minute: 30, hour: 3, day_of_week: null, day_of_month: 1 }
    });
    expect(result.success).toBe(true);
  });

  it("accepts server and system as null (initializing status)", () => {
    const result = HetznerStorageBoxSchema.safeParse({
      ...validBox,
      server: null,
      system: null
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown top-level fields silently (forward compatibility)", () => {
    const parsed = HetznerStorageBoxSchema.parse({
      ...validBox,
      future_unknown_field: "ignored"
    });
    expect(parsed).not.toHaveProperty("future_unknown_field");
    expect(parsed.id).toBe(validBox.id);
  });

  it("preserves unknown fields inside access_settings (passthrough)", () => {
    const parsed = HetznerStorageBoxSchema.parse({
      ...validBox,
      access_settings: {
        ...validBox.access_settings,
        new_protocol_enabled: true
      }
    });
    const settings = parsed.access_settings as Record<string, unknown>;
    expect(settings.new_protocol_enabled).toBe(true);
  });
});

describe("HetznerStorageBoxSubaccountSchema", () => {
  it("parses a valid subaccount with null comment", () => {
    expect(HetznerStorageBoxSubaccountSchema.parse(validSubaccount)).toEqual(validSubaccount);
  });

  it("accepts non-null comment string", () => {
    const result = HetznerStorageBoxSubaccountSchema.safeParse({
      ...validSubaccount,
      comment: "backup user"
    });
    expect(result.success).toBe(true);
  });

  it("rejects when readonly is missing", () => {
    const { readonly: _omit, ...rest } = validSubaccount;
    void _omit;
    expect(HetznerStorageBoxSubaccountSchema.safeParse(rest).success).toBe(false);
  });
});

describe("HetznerPaginationSchema", () => {
  it("parses a valid pagination envelope", () => {
    expect(HetznerPaginationSchema.parse(validPagination)).toEqual(validPagination);
  });

  it("accepts null next_page (end of stream)", () => {
    expect(
      HetznerPaginationSchema.safeParse({ ...validPagination, next_page: null }).success
    ).toBe(true);
  });
});

describe("ListStorageBoxesResponseSchema", () => {
  it("parses a response with items and pagination", () => {
    const result = ListStorageBoxesResponseSchema.parse({
      storage_boxes: [validBox],
      meta: { pagination: validPagination }
    });
    expect(result.storage_boxes).toHaveLength(1);
    expect(result.meta?.pagination?.next_page).toBe(2);
  });

  it("parses a response without meta (older API shape)", () => {
    const result = ListStorageBoxesResponseSchema.parse({
      storage_boxes: [validBox]
    });
    expect(result.storage_boxes).toHaveLength(1);
    expect(result.meta).toBeUndefined();
  });

  it("rejects when storage_boxes key is missing entirely", () => {
    expect(ListStorageBoxesResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects when storage_boxes is not an array", () => {
    expect(
      ListStorageBoxesResponseSchema.safeParse({ storage_boxes: "not-array" }).success
    ).toBe(false);
  });

  it("rejects when one box in the array is malformed", () => {
    const result = ListStorageBoxesResponseSchema.safeParse({
      storage_boxes: [validBox, { id: 2 }] // second box missing required fields
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("storage_boxes");
      expect(result.error.issues[0].path).toContain(1);
    }
  });
});

describe("GetStorageBoxResponseSchema", () => {
  it("parses a single-box response", () => {
    const result = GetStorageBoxResponseSchema.parse({ storage_box: validBox });
    expect(result.storage_box.id).toBe(validBox.id);
  });

  it("rejects array shape (caller used wrong endpoint)", () => {
    expect(
      GetStorageBoxResponseSchema.safeParse({ storage_boxes: [validBox] }).success
    ).toBe(false);
  });
});

describe("ListStorageBoxSubaccountsResponseSchema", () => {
  it("parses a response with subaccounts", () => {
    const result = ListStorageBoxSubaccountsResponseSchema.parse({
      subaccounts: [validSubaccount]
    });
    expect(result.subaccounts).toHaveLength(1);
  });

  it("rejects when subaccounts key is missing", () => {
    expect(ListStorageBoxSubaccountsResponseSchema.safeParse({}).success).toBe(false);
  });
});
