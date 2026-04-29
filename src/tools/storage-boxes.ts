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
  HetznerStorageBox,
  HetznerStorageBoxSubaccount,
  HetznerMeta,
  BooleanKeys
} from "../types.js";

const ResponseFormatSchema = z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN);
const PAGINATION_HARD_CAP_PAGES = 5;

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

export interface PaginatedListResult<T> {
  items: T[];
  truncated: boolean;
  // I-1: when set, fetching mid-stream failed AFTER at least one page succeeded.
  // The first-page failure path still throws so the caller's catch sees it.
  partialFailure?: string;
}

type ListExtractor<TResponse, TItem> = (resp: TResponse) => TItem[];

// I-5: use the named HetznerMeta in the constraint instead of an inline anonymous shape
// so future changes to the meta envelope propagate automatically.
// C-1: schema is validated inside makeStorageBoxApiRequest.
// Exported for unit testing.
export async function paginatedFetch<TResponse extends { meta?: HetznerMeta }, TItem>(
  endpoint: string,
  schema: z.ZodType<TResponse>,
  extractItems: ListExtractor<TResponse, TItem>,
  perPage: number = 50
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
      // First-page failure → propagate so the caller returns isError: true.
      if (pagesFetched === 0) {
        throw error;
      }
      // Mid-stream failure → return partial results with the error noted.
      return {
        items: accumulated,
        truncated: false,
        partialFailure: handleApiError(error)
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
        let partialFailure: string | undefined;

        if (params.page !== undefined) {
          const data = await makeStorageBoxApiRequest(
            "/storage_boxes",
            ListStorageBoxesResponseSchema,
            "GET",
            undefined,
            { page: params.page, per_page: params.per_page ?? 50 }
          );
          boxes = data.storage_boxes;
        } else {
          const result = await paginatedFetch<ListStorageBoxesResponse, HetznerStorageBox>(
            "/storage_boxes",
            ListStorageBoxesResponseSchema,
            (r) => r.storage_boxes,
            params.per_page ?? 50
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
          lines.push(`> ⚠️ Partial result: pagination failed mid-stream. ${partialFailure}`);
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
        let partialFailure: string | undefined;

        if (params.page !== undefined) {
          const data = await makeStorageBoxApiRequest(
            endpoint,
            ListStorageBoxSubaccountsResponseSchema,
            "GET",
            undefined,
            { page: params.page, per_page: params.per_page ?? 50 }
          );
          subaccounts = data.subaccounts;
        } else {
          const result = await paginatedFetch<ListStorageBoxSubaccountsResponse, HetznerStorageBoxSubaccount>(
            endpoint,
            ListStorageBoxSubaccountsResponseSchema,
            (r) => r.subaccounts,
            params.per_page ?? 50
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
          lines.push(`> ⚠️ Partial result: pagination failed mid-stream. ${partialFailure}`);
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
}
