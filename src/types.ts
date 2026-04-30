// Hetzner Cloud API Type Definitions

import { z } from "zod";

// Response format enum
export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

// Utility: keys of T whose value type is exactly `boolean`. Used to constrain
// arrays like STORAGE_BOX_PROTOCOLS so a typo (e.g. "name") fails typecheck.
//
// NOTE: This excludes nullable booleans (`boolean | null`) by design — the
// runtime check `obj[key] === true` only makes sense for non-nullable booleans.
// If a schema field becomes `z.boolean().nullable()`, it will silently fall
// out of the protocol list. Keep boolean fields non-nullable in schemas, or
// widen this constraint to `T[K] extends boolean | null` if nulls are needed.
export type BooleanKeys<T> = {
  [K in keyof T]-?: T[K] extends boolean ? K : never;
}[keyof T];

// =====================================================================
// Cloud API — Zod schemas at the boundary (C-2 from /review-pr round 3).
// Same rationale as the Storage Box schemas: makeApiRequest validates
// every response with .parse(), so unexpected API shapes throw ZodError
// instead of silently coercing to undefined downstream.
// =====================================================================

export const HetznerActionSchema = z.object({
  id: z.number(),
  command: z.string(),
  status: z.enum(["running", "success", "error"]),
  progress: z.number(),
  started: z.string(),
  finished: z.string().nullable(),
  error: z.object({
    code: z.string(),
    message: z.string()
  }).nullable()
});
export type HetznerAction = z.infer<typeof HetznerActionSchema>;

export const HetznerServerSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.enum([
    "running",
    "initializing",
    "starting",
    "stopping",
    "off",
    "deleting",
    "rebuilding",
    "migrating",
    "unknown"
  ]),
  public_net: z.object({
    ipv4: z.object({ ip: z.string() }).nullable(),
    ipv6: z.object({ ip: z.string() }).nullable()
  }),
  server_type: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    cores: z.number(),
    memory: z.number(),
    disk: z.number()
  }),
  datacenter: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    location: z.object({
      id: z.number(),
      name: z.string(),
      city: z.string(),
      country: z.string()
    })
  }),
  image: z.object({
    id: z.number(),
    name: z.string(),
    description: z.string(),
    os_flavor: z.string(),
    os_version: z.string()
  }).nullable(),
  labels: z.record(z.string(), z.string()),
  created: z.string()
});
export type HetznerServer = z.infer<typeof HetznerServerSchema>;

export const HetznerServerTypeSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  cores: z.number(),
  memory: z.number(),
  disk: z.number(),
  prices: z.array(z.object({
    location: z.string(),
    price_hourly: z.object({ net: z.string(), gross: z.string() }),
    price_monthly: z.object({ net: z.string(), gross: z.string() })
  })),
  architecture: z.string(),
  cpu_type: z.string()
});
export type HetznerServerType = z.infer<typeof HetznerServerTypeSchema>;

export const HetznerImageSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  os_flavor: z.string(),
  os_version: z.string(),
  type: z.enum(["system", "snapshot", "backup", "app"]),
  status: z.enum(["available", "creating", "unavailable"]),
  architecture: z.string()
});
export type HetznerImage = z.infer<typeof HetznerImageSchema>;

export const HetznerLocationSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  country: z.string(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  network_zone: z.string()
});
export type HetznerLocation = z.infer<typeof HetznerLocationSchema>;

export const HetznerSSHKeySchema = z.object({
  id: z.number(),
  name: z.string(),
  fingerprint: z.string(),
  public_key: z.string(),
  labels: z.record(z.string(), z.string()),
  created: z.string()
});
export type HetznerSSHKey = z.infer<typeof HetznerSSHKeySchema>;

// API Response wrappers
export const ListServersResponseSchema = z.object({
  servers: z.array(HetznerServerSchema)
});
export type ListServersResponse = z.infer<typeof ListServersResponseSchema>;

export const GetServerResponseSchema = z.object({
  server: HetznerServerSchema
});
export type GetServerResponse = z.infer<typeof GetServerResponseSchema>;

export const CreateServerResponseSchema = z.object({
  server: HetznerServerSchema,
  action: HetznerActionSchema,
  root_password: z.string().nullable()
});
export type CreateServerResponse = z.infer<typeof CreateServerResponseSchema>;

export const ServerActionResponseSchema = z.object({
  action: HetznerActionSchema
});
export type ServerActionResponse = z.infer<typeof ServerActionResponseSchema>;

export const ListServerTypesResponseSchema = z.object({
  server_types: z.array(HetznerServerTypeSchema)
});
export type ListServerTypesResponse = z.infer<typeof ListServerTypesResponseSchema>;

export const ListImagesResponseSchema = z.object({
  images: z.array(HetznerImageSchema)
});
export type ListImagesResponse = z.infer<typeof ListImagesResponseSchema>;

export const ListLocationsResponseSchema = z.object({
  locations: z.array(HetznerLocationSchema)
});
export type ListLocationsResponse = z.infer<typeof ListLocationsResponseSchema>;

export const ListSSHKeysResponseSchema = z.object({
  ssh_keys: z.array(HetznerSSHKeySchema)
});
export type ListSSHKeysResponse = z.infer<typeof ListSSHKeysResponseSchema>;

export const GetSSHKeyResponseSchema = z.object({
  ssh_key: HetznerSSHKeySchema
});
export type GetSSHKeyResponse = z.infer<typeof GetSSHKeyResponseSchema>;

export const CreateSSHKeyResponseSchema = z.object({
  ssh_key: HetznerSSHKeySchema
});
export type CreateSSHKeyResponse = z.infer<typeof CreateSSHKeyResponseSchema>;

// Storage Box — Zod schemas at API boundary (C-1).
// These schemas are validated at runtime via makeStorageBoxApiRequest, so
// unexpected API response shapes fail loudly with a ZodError instead of
// silently coercing to undefined. Static types are inferred via z.infer to
// keep a single source of truth.

// Pagination envelope returned by Hetzner unified API list endpoints.
// Only `next_page` is consumed by paginatedFetch; the other fields are made
// optional so an API response that omits them does not throw ZodError on
// data we never read (I-1 from /review-pr round 3).
export const HetznerPaginationSchema = z.object({
  page: z.number().optional(),
  per_page: z.number().optional(),
  previous_page: z.number().nullable().optional(),
  next_page: z.number().nullable(),
  last_page: z.number().nullable().optional(),
  total_entries: z.number().nullable().optional()
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
