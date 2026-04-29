import { describe, it, expect } from "vitest";
import {
  formatBytes,
  formatStorageBox,
  formatSubaccount
} from "../../src/tools/storage-boxes.js";
import {
  HetznerStorageBox,
  HetznerStorageBoxSubaccount
} from "../../src/types.js";

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
