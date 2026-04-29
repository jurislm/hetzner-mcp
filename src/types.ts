// Hetzner Cloud API Type Definitions

import { z } from "zod";

// Response format enum
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

// Utility: keys of T whose value type is exactly `boolean`. Used to constrain
// arrays like STORAGE_BOX_PROTOCOLS so a typo (e.g. "name") fails typecheck.
export type BooleanKeys<T> = {
  [K in keyof T]-?: T[K] extends boolean ? K : never;
}[keyof T];

// Server types
export interface HetznerServer {
  id: number;
  name: string;
  status: "running" | "initializing" | "starting" | "stopping" | "off" | "deleting" | "rebuilding" | "migrating" | "unknown";
  public_net: {
    ipv4: {
      ip: string;
    } | null;
    ipv6: {
      ip: string;
    } | null;
  };
  server_type: {
    id: number;
    name: string;
    description: string;
    cores: number;
    memory: number;
    disk: number;
  };
  datacenter: {
    id: number;
    name: string;
    description: string;
    location: {
      id: number;
      name: string;
      city: string;
      country: string;
    };
  };
  image: {
    id: number;
    name: string;
    description: string;
    os_flavor: string;
    os_version: string;
  } | null;
  labels: Record<string, string>;
  created: string;
}

export interface HetznerServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  prices: {
    location: string;
    price_hourly: {
      net: string;
      gross: string;
    };
    price_monthly: {
      net: string;
      gross: string;
    };
  }[];
  architecture: string;
  cpu_type: string;
}

export interface HetznerImage {
  id: number;
  name: string;
  description: string;
  os_flavor: string;
  os_version: string;
  type: "system" | "snapshot" | "backup" | "app";
  status: "available" | "creating" | "unavailable";
  architecture: string;
}

export interface HetznerLocation {
  id: number;
  name: string;
  description: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  network_zone: string;
}

export interface HetznerSSHKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
  labels: Record<string, string>;
  created: string;
}

export interface HetznerAction {
  id: number;
  command: string;
  status: "running" | "success" | "error";
  progress: number;
  started: string;
  finished: string | null;
  error: {
    code: string;
    message: string;
  } | null;
}

// API Response wrappers
export interface ListServersResponse {
  servers: HetznerServer[];
}

export interface GetServerResponse {
  server: HetznerServer;
}

export interface CreateServerResponse {
  server: HetznerServer;
  action: HetznerAction;
  root_password: string | null;
}

export interface ServerActionResponse {
  action: HetznerAction;
}

export interface ListServerTypesResponse {
  server_types: HetznerServerType[];
}

export interface ListImagesResponse {
  images: HetznerImage[];
}

export interface ListLocationsResponse {
  locations: HetznerLocation[];
}

export interface ListSSHKeysResponse {
  ssh_keys: HetznerSSHKey[];
}

export interface GetSSHKeyResponse {
  ssh_key: HetznerSSHKey;
}

export interface CreateSSHKeyResponse {
  ssh_key: HetznerSSHKey;
}

// Storage Box — Zod schemas at API boundary (C-1).
// These schemas are validated at runtime via makeStorageBoxApiRequest, so
// unexpected API response shapes fail loudly with a ZodError instead of
// silently coercing to undefined. Static types are inferred via z.infer to
// keep a single source of truth.

// Pagination envelope returned by Hetzner unified API list endpoints.
export const HetznerPaginationSchema = z.object({
  page: z.number(),
  per_page: z.number(),
  previous_page: z.number().nullable(),
  next_page: z.number().nullable(),
  last_page: z.number().nullable(),
  total_entries: z.number().nullable()
});
export type HetznerPagination = z.infer<typeof HetznerPaginationSchema>;

export const HetznerMetaSchema = z.object({
  pagination: HetznerPaginationSchema.optional()
});
export type HetznerMeta = z.infer<typeof HetznerMetaSchema>;

export const HetznerStorageBoxSchema = z.object({
  id: z.number(),
  name: z.string(),
  login: z.string(),
  product: z.string(),
  location: z.string(),
  quota_bytes: z.number(),
  used_bytes: z.number(),
  snapshots_used_bytes: z.number(),
  ssh: z.boolean(),
  webdav: z.boolean(),
  samba: z.boolean(),
  zfs: z.boolean(),
  external_reachability: z.boolean(),
  locked: z.boolean(),
  cancelled: z.boolean(),
  paid_until: z.string().nullable()
});
export type HetznerStorageBox = z.infer<typeof HetznerStorageBoxSchema>;

export const HetznerStorageBoxSubaccountSchema = z.object({
  username: z.string(),
  home_directory: z.string(),
  ssh: z.boolean(),
  webdav: z.boolean(),
  samba: z.boolean(),
  external_reachability: z.boolean(),
  readonly: z.boolean(),
  comment: z.string().nullable()
});
export type HetznerStorageBoxSubaccount = z.infer<typeof HetznerStorageBoxSubaccountSchema>;

export const ListStorageBoxesResponseSchema = z.object({
  storage_boxes: z.array(HetznerStorageBoxSchema),
  meta: HetznerMetaSchema.optional()
});
export type ListStorageBoxesResponse = z.infer<typeof ListStorageBoxesResponseSchema>;

export const GetStorageBoxResponseSchema = z.object({
  storage_box: HetznerStorageBoxSchema
});
export type GetStorageBoxResponse = z.infer<typeof GetStorageBoxResponseSchema>;

export const ListStorageBoxSubaccountsResponseSchema = z.object({
  subaccounts: z.array(HetznerStorageBoxSubaccountSchema),
  meta: HetznerMetaSchema.optional()
});
export type ListStorageBoxSubaccountsResponse = z.infer<typeof ListStorageBoxSubaccountsResponseSchema>;

// API Error
export interface HetznerAPIError {
  error: {
    code: string;
    message: string;
  };
}
