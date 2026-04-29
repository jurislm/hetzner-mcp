import { describe, it, expect } from "vitest";
import {
  HetznerStorageBoxSchema,
  HetznerStorageBoxSubaccountSchema,
  HetznerPaginationSchema,
  ListStorageBoxesResponseSchema,
  GetStorageBoxResponseSchema,
  ListStorageBoxSubaccountsResponseSchema
} from "../src/types.js";

const validBox = {
  id: 1,
  name: "test-box",
  login: "u123",
  product: "BX11",
  location: "fsn1",
  quota_bytes: 1099511627776,
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
    expect(HetznerStorageBoxSchema.parse(validBox)).toEqual(validBox);
  });

  it("rejects when quota_bytes is a string (silent type coercion bug)", () => {
    const result = HetznerStorageBoxSchema.safeParse({
      ...validBox,
      quota_bytes: "1099511627776"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("quota_bytes");
    }
  });

  it("rejects when ssh is a truthy string instead of boolean", () => {
    const result = HetznerStorageBoxSchema.safeParse({ ...validBox, ssh: "yes" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("ssh");
    }
  });

  it("rejects when paid_until is missing entirely", () => {
    const { paid_until: _omit, ...rest } = validBox;
    void _omit;
    const result = HetznerStorageBoxSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("accepts paid_until as ISO string", () => {
    const result = HetznerStorageBoxSchema.safeParse({
      ...validBox,
      paid_until: "2026-12-31T23:59:59+00:00"
    });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields silently (forward compatibility)", () => {
    const parsed = HetznerStorageBoxSchema.parse({
      ...validBox,
      future_unknown_field: "ignored"
    });
    expect(parsed).not.toHaveProperty("future_unknown_field");
    expect(parsed.id).toBe(validBox.id);
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
