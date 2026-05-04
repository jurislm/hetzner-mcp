import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeStorageBoxApiRequest, handleApiError } from "../api.js";
import {
  ResponseFormat,
  ListStorageBoxesResponse,
  ListStorageBoxesResponseSchema,
  GetStorageBoxResponseSchema,
  ListStorageBoxSubaccountsResponse,
  ListStorageBoxSubaccountsResponseSchema,
  ListStorageBoxSnapshotsResponse,
  ListStorageBoxSnapshotsResponseSchema,
  CreateStorageBoxSnapshotResponseSchema,
  RollbackStorageBoxSnapshotResponseSchema,
  HetznerStorageBox,
  HetznerStorageBoxSubaccount,
  HetznerStorageBoxSnapshot,
  HetznerAction,
  HetznerMeta,
  BooleanKeys
} from "../types.js";

const ResponseFormatSchema = z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN);
const PAGINATION_HARD_CAP_PAGES = 5;
const DEFAULT_PER_PAGE = 50;

// C-3: constrain to keys whose value type is `boolean` so a typo like "name"
// fails typecheck instead of silently filtering to false at runtime.
const STORAGE_BOX_PROTOCOLS = ["ssh", "webdav", "samba", "zfs"] as const satisfies readonly BooleanKeys<HetznerStorageBox>[];
const SUBACCOUNT_PROTOCOLS = ["ssh", "webdav", "samba"] as const satisfies readonly BooleanKeys<HetznerStorageBoxSubaccount>[];

// Exported for unit testing.
export function formatBytes(bytes: number): string {
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) {
    return `${gib.toFixed(1)} GiB`;
  }
  return `${(bytes / (1024 ** 2)).toFixed(0)} MiB`;
}

// Exported for unit testing.
export function formatStorageBox(box: HetznerStorageBox): string {
  const protocols = STORAGE_BOX_PROTOCOLS
    .filter((p) => box[p] === true)
    .join(", ") || "none";

  const lines = [
    `## ${box.name} (ID: ${box.id})`,
    `- **Login**: ${box.login}`,
    `- **Product**: ${box.product}`,
    `- **Location**: ${box.location}`,
    `- **Storage**: ${formatBytes(box.used_bytes)} used / ${formatBytes(box.quota_bytes)} total`,
    `- **Snapshots**: ${formatBytes(box.snapshots_used_bytes)}`,
    `- **Protocols**: ${protocols}`,
    `- **External reachability**: ${box.external_reachability ? "yes" : "no"}`,
    `- **Locked**: ${box.locked ? "yes" : "no"}`,
    `- **Cancelled**: ${box.cancelled ? "yes" : "no"}`
  ];

  if (box.paid_until) {
    lines.push(`- **Paid until**: ${box.paid_until.slice(0, 10)}`);
  }

  return lines.join("\n");
}

// Exported for unit testing.
export function formatSubaccount(sub: HetznerStorageBoxSubaccount): string {
  const protocols = SUBACCOUNT_PROTOCOLS
    .filter((p) => sub[p] === true)
    .join(", ") || "none";

  const lines: string[] = [
    `## ${sub.username}`,
    `- **Home directory**: ${sub.home_directory}`,
    `- **Protocols**: ${protocols}`,
    `- **External reachability**: ${sub.external_reachability ? "yes" : "no"}`,
    `- **Read-only**: ${sub.readonly ? "yes" : "no"}`
  ];

  if (sub.comment) {
    lines.push(`- **Comment**: ${sub.comment}`);
  }

  return lines.join("\n");
}

// Exported for unit testing.
export function formatSnapshot(snap: HetznerStorageBoxSnapshot): string {
  const lines: string[] = [
    `## ${snap.name} (ID: ${snap.id})`,
    `- **Created**: ${snap.created.slice(0, 10)}`
  ];
  if (snap.description) {
    lines.push(`- **Description**: ${snap.description}`);
  }
  if (snap.stats?.size !== undefined) {
    lines.push(`- **Size**: ${formatBytes(snap.stats.size)}`);
  }
  if (snap.is_automatic !== undefined) {
    lines.push(`- **Automatic**: ${snap.is_automatic ? "yes" : "no"}`);
  }
  return lines.join("\n");
}

// Exported for unit testing.
export function formatAction(action: HetznerAction): string {
  const lines: string[] = [
    `- **Action ID**: ${action.id}`,
    `- **Command**: ${action.command}`,
    `- **Status**: ${action.status}`,
    `- **Progress**: ${action.progress}%`
  ];
  if (action.error) {
    lines.push(`- **Error**: ${action.error.code} — ${action.error.message}`);
  }
  return lines.join("\n");
}

// I-3: partialFailure is structured so callers can route by error kind
// (retry on network, alert on schema mismatch, etc.) instead of parsing
// a flat string.
export type PartialFailureKind = "zod" | "network" | "http" | "other";

export interface PartialFailure {
  message: string;
  kind: PartialFailureKind;
  pagesSucceeded: number;
}

export interface PaginatedListResult<T> {
  items: T[];
  truncated: boolean;
  // When set, fetching mid-stream failed AFTER at least one page succeeded.
  // The first-page failure path still throws so the caller's catch sees it.
  partialFailure?: PartialFailure;
}

type ListExtractor<TResponse, TItem> = (resp: TResponse) => TItem[];

function classifyError(error: unknown): PartialFailureKind {
  if (error instanceof z.ZodError) return "zod";
  if (typeof error === "object" && error !== null) {
    const e = error as { response?: unknown; code?: string };
    if (e.response !== undefined) return "http";
    if (typeof e.code === "string") return "network";
  }
  return "other";
}

// I-5: use the named HetznerMeta in the constraint instead of an inline anonymous shape
// so future changes to the meta envelope propagate automatically.
// C-1 (round 2): schema is validated inside makeStorageBoxApiRequest.
// C-1 (round 3): a ZodError mid-stream means the API returned a structurally
// different shape on a later page — pages 1..N-1 are no longer trustworthy.
// Always propagate ZodError, never return partial.
// Exported for unit testing.
export async function paginatedFetch<TResponse extends { meta?: HetznerMeta }, TItem>(
  endpoint: string,
  schema: z.ZodType<TResponse>,
  extractItems: ListExtractor<TResponse, TItem>,
  perPage: number = DEFAULT_PER_PAGE
): Promise<PaginatedListResult<TItem>> {
  const accumulated: TItem[] = [];
  let nextPage: number | null = 1;
  let pagesFetched = 0;
  let truncated = false;

  while (nextPage !== null) {
    if (pagesFetched >= PAGINATION_HARD_CAP_PAGES) {
      truncated = true;
      break;
    }
    try {
      const pageData: TResponse = await makeStorageBoxApiRequest<TResponse>(endpoint, schema, "GET", undefined, {
        page: nextPage,
        per_page: perPage
      });
      accumulated.push(...extractItems(pageData));
      pagesFetched += 1;
      nextPage = pageData.meta?.pagination?.next_page ?? null;
    } catch (error) {
      // ZodError = API contract violation. Pages already fetched were
      // validated against a now-questionable schema — bail entirely.
      if (error instanceof z.ZodError) {
        throw error;
      }
      // First-page failure → propagate so the caller returns isError: true.
      if (pagesFetched === 0) {
        throw error;
      }
      // Mid-stream non-ZodError → return partial with structured info.
      return {
        items: accumulated,
        truncated: false,
        partialFailure: {
          message: handleApiError(error),
          kind: classifyError(error),
          pagesSucceeded: pagesFetched
        }
      };
    }
  }

  return { items: accumulated, truncated };
}

const TRUNCATION_NOTE = `> ⚠️ Truncated at ${PAGINATION_HARD_CAP_PAGES} pages — supply explicit \`page\` to fetch more.`;

export function registerStorageBoxTools(server: McpServer): void {
  // List Storage Boxes
  server.registerTool(
    "hetzner_list_storage_boxes",
    {
      title: "List Storage Boxes",
      description: `List Storage Boxes in the account.

By default fetches all pages (cap: ${PAGINATION_HARD_CAP_PAGES} pages × 50 per page = 250 boxes).
Supply explicit \`page\` and/or \`per_page\` to fetch a single page.

Returns Storage Boxes with their:
- Name and ID
- Login name and product type
- Location
- Storage usage and quota
- Enabled protocols (SSH, WebDAV, Samba, ZFS)`,
      inputSchema: z.object({
        page: z.number().int().positive().optional().describe("Page number (1-based). When set, fetches a single page only."),
        per_page: z.number().int().positive().max(50).optional().describe("Items per page (max 50). Default 50."),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        let boxes: HetznerStorageBox[];
        let truncated = false;
        let partialFailure: PartialFailure | undefined;

        if (params.page !== undefined) {
          const data = await makeStorageBoxApiRequest(
            "/storage_boxes",
            ListStorageBoxesResponseSchema,
            "GET",
            undefined,
            { page: params.page, per_page: params.per_page ?? DEFAULT_PER_PAGE }
          );
          boxes = data.storage_boxes;
        } else {
          const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
            "/storage_boxes",
            ListStorageBoxesResponseSchema,
            (r) => r.storage_boxes,
            params.per_page ?? DEFAULT_PER_PAGE
          );
          boxes = result.items;
          truncated = result.truncated;
          partialFailure = result.partialFailure;
        }

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify({ storage_boxes: boxes, truncated, partialFailure }, null, 2) }]
          };
        }

        if (boxes.length === 0 && !partialFailure) {
          return {
            content: [{ type: "text", text: "No Storage Boxes found." }]
          };
        }

        const lines = ["# Storage Boxes", "", `Found ${boxes.length} storage box(es):`, ""];
        for (const box of boxes) {
          lines.push(formatStorageBox(box));
          lines.push("");
        }
        if (truncated) {
          lines.push(TRUNCATION_NOTE);
        }
        if (partialFailure) {
          lines.push(`> ⚠️ Partial result: pagination failed after ${partialFailure.pagesSucceeded} page(s) (${partialFailure.kind}): ${partialFailure.message}`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // Get Storage Box
  server.registerTool(
    "hetzner_get_storage_box",
    {
      title: "Get Storage Box",
      description: `Get detailed information about a specific Storage Box.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Storage Box ID"),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const data = await makeStorageBoxApiRequest(`/storage_boxes/${params.id}`, GetStorageBoxResponseSchema);
        const box = data.storage_box;

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(box, null, 2) }]
          };
        }

        const lines = ["# Storage Box Details", "", formatStorageBox(box)];
        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // List Storage Box Subaccounts
  server.registerTool(
    "hetzner_list_storage_box_subaccounts",
    {
      title: "List Storage Box Subaccounts",
      description: `List subaccounts for a specific Storage Box.

By default fetches all pages (cap: ${PAGINATION_HARD_CAP_PAGES} pages × 50 per page = 250 subaccounts).
Supply explicit \`page\` and/or \`per_page\` to fetch a single page.

Returns subaccounts with their:
- Username and home directory
- Enabled protocols (SSH, WebDAV, Samba)
- External reachability and read-only status`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Storage Box ID"),
        page: z.number().int().positive().optional().describe("Page number (1-based). When set, fetches a single page only."),
        per_page: z.number().int().positive().max(50).optional().describe("Items per page (max 50). Default 50."),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const endpoint = `/storage_boxes/${params.id}/subaccounts`;
        let subaccounts: HetznerStorageBoxSubaccount[];
        let truncated = false;
        let partialFailure: PartialFailure | undefined;

        if (params.page !== undefined) {
          const data = await makeStorageBoxApiRequest(
            endpoint,
            ListStorageBoxSubaccountsResponseSchema,
            "GET",
            undefined,
            { page: params.page, per_page: params.per_page ?? DEFAULT_PER_PAGE }
          );
          subaccounts = data.subaccounts;
        } else {
          const result = await paginatedFetch<ListStorageBoxSubaccountsResponse, HetznerStorageBoxSubaccount>(
            endpoint,
            ListStorageBoxSubaccountsResponseSchema,
            (r) => r.subaccounts,
            params.per_page ?? DEFAULT_PER_PAGE
          );
          subaccounts = result.items;
          truncated = result.truncated;
          partialFailure = result.partialFailure;
        }

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify({ subaccounts, truncated, partialFailure }, null, 2) }]
          };
        }

        if (subaccounts.length === 0 && !partialFailure) {
          return {
            content: [{ type: "text", text: `No subaccounts found for Storage Box ${params.id}.` }]
          };
        }

        const lines = [
          `# Subaccounts for Storage Box ${params.id}`,
          "",
          `Found ${subaccounts.length} subaccount(s):`,
          ""
        ];
        for (const sub of subaccounts) {
          lines.push(formatSubaccount(sub));
          lines.push("");
        }
        if (truncated) {
          lines.push(TRUNCATION_NOTE);
        }
        if (partialFailure) {
          lines.push(`> ⚠️ Partial result: pagination failed after ${partialFailure.pagesSucceeded} page(s) (${partialFailure.kind}): ${partialFailure.message}`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // List Storage Box Snapshots
  server.registerTool(
    "hetzner_list_storage_box_snapshots",
    {
      title: "List Storage Box Snapshots",
      description: `List snapshots for a specific Storage Box.

By default fetches all pages (cap: ${PAGINATION_HARD_CAP_PAGES} pages × 50 per page = 250 snapshots).
Supply explicit \`page\` and/or \`per_page\` to fetch a single page.

Returns each snapshot with its id, name, description, created timestamp,
optional size, and whether it was created by the automatic snapshot plan.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Storage Box ID"),
        page: z.number().int().positive().optional().describe("Page number (1-based). When set, fetches a single page only."),
        per_page: z.number().int().positive().max(50).optional().describe("Items per page (max 50). Default 50."),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const endpoint = `/storage_boxes/${params.id}/snapshots`;
        let snapshots: HetznerStorageBoxSnapshot[];
        let truncated = false;
        let partialFailure: PartialFailure | undefined;

        if (params.page !== undefined) {
          const data = await makeStorageBoxApiRequest(
            endpoint,
            ListStorageBoxSnapshotsResponseSchema,
            "GET",
            undefined,
            { page: params.page, per_page: params.per_page ?? DEFAULT_PER_PAGE }
          );
          snapshots = data.snapshots;
        } else {
          const result = await paginatedFetch<ListStorageBoxSnapshotsResponse, HetznerStorageBoxSnapshot>(
            endpoint,
            ListStorageBoxSnapshotsResponseSchema,
            (r) => r.snapshots,
            params.per_page ?? DEFAULT_PER_PAGE
          );
          snapshots = result.items;
          truncated = result.truncated;
          partialFailure = result.partialFailure;
        }

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify({ snapshots, truncated, partialFailure }, null, 2) }]
          };
        }

        if (snapshots.length === 0 && !partialFailure) {
          return {
            content: [{ type: "text", text: `No snapshots found for Storage Box ${params.id}.` }]
          };
        }

        const lines = [
          `# Snapshots for Storage Box ${params.id}`,
          "",
          `Found ${snapshots.length} snapshot(s):`,
          ""
        ];
        for (const snap of snapshots) {
          lines.push(formatSnapshot(snap));
          lines.push("");
        }
        if (truncated) {
          lines.push(TRUNCATION_NOTE);
        }
        if (partialFailure) {
          lines.push(`> ⚠️ Partial result: pagination failed after ${partialFailure.pagesSucceeded} page(s) (${partialFailure.kind}): ${partialFailure.message}`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // Create Storage Box Snapshot
  server.registerTool(
    "hetzner_create_storage_box_snapshot",
    {
      title: "Create Storage Box Snapshot",
      description: `Trigger an on-demand snapshot for a Storage Box.

Optional \`description\` and \`labels\` are forwarded as the request body.
Returns the new snapshot id and the action envelope (status, progress).`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Storage Box ID"),
        description: z.string().optional().describe("Optional human-readable description for the snapshot"),
        labels: z.record(z.string(), z.string()).optional().describe("Optional Hetzner labels (string→string map)"),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {};
        if (params.description !== undefined) body.description = params.description;
        if (params.labels !== undefined) body.labels = params.labels;

        const data = await makeStorageBoxApiRequest(
          `/storage_boxes/${params.id}/snapshots`,
          CreateStorageBoxSnapshotResponseSchema,
          "POST",
          body
        );

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
          };
        }

        const lines = [
          `# Snapshot Created for Storage Box ${params.id}`,
          "",
          formatSnapshot(data.snapshot),
          "",
          "## Action",
          formatAction(data.action)
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // Rollback Storage Box Snapshot
  server.registerTool(
    "hetzner_rollback_storage_box_snapshot",
    {
      title: "Rollback Storage Box Snapshot",
      description: `Roll a Storage Box back to a previous snapshot.

⚠️ DESTRUCTIVE: this overwrites the current state of the Storage Box.
Any data written after the snapshot was taken will be lost.

The \`snapshot\` parameter accepts the snapshot's name OR its numeric id.
(The legacy \`snapshot_id\` API field has been deprecated by Hetzner;
this tool uses the replacement \`snapshot\` field.)`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Storage Box ID"),
        snapshot: z
          .string()
          .min(1)
          .refine((s) => s.trim().length > 0, { message: "snapshot must not be blank" })
          .describe("Snapshot name or numeric ID (as string) to roll back to"),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const data = await makeStorageBoxApiRequest(
          `/storage_boxes/${params.id}/actions/rollback_snapshot`,
          RollbackStorageBoxSnapshotResponseSchema,
          "POST",
          { snapshot: params.snapshot }
        );

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
          };
        }

        const lines = [
          `# Rollback Triggered for Storage Box ${params.id}`,
          "",
          `Rolling back to snapshot: \`${params.snapshot}\``,
          "",
          "## Action",
          formatAction(data.action)
        ];

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );
}
