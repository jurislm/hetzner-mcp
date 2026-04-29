import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeStorageBoxApiRequest, handleApiError } from "../api.js";
import {
  ResponseFormat,
  ListStorageBoxesResponse,
  GetStorageBoxResponse,
  ListStorageBoxSubaccountsResponse,
  HetznerStorageBox,
  HetznerStorageBoxSubaccount
} from "../types.js";

const ResponseFormatSchema = z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN);

function formatBytes(bytes: number): string {
  const gb = bytes / (1024 ** 3);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 ** 2)).toFixed(0)} MB`;
}

function formatStorageBox(box: HetznerStorageBox): string {
  const protocols = ["ssh", "webdav", "samba", "zfs"]
    .filter((p) => box[p as keyof HetznerStorageBox])
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
    lines.push(`- **Paid until**: ${new Date(box.paid_until).toLocaleDateString()}`);
  }

  return lines.join("\n");
}

function formatSubaccount(sub: HetznerStorageBoxSubaccount): string {
  const protocols = ["ssh", "webdav", "samba"]
    .filter((p) => sub[p as keyof HetznerStorageBoxSubaccount])
    .join(", ") || "none";

  return [
    `## ${sub.username}`,
    `- **Home directory**: ${sub.home_directory}`,
    `- **Protocols**: ${protocols}`,
    `- **External reachability**: ${sub.external_reachability ? "yes" : "no"}`,
    `- **Read-only**: ${sub.readonly ? "yes" : "no"}`,
    sub.comment ? `- **Comment**: ${sub.comment}` : null
  ].filter(Boolean).join("\n");
}

export function registerStorageBoxTools(server: McpServer): void {
  // List Storage Boxes
  server.registerTool(
    "hetzner_list_storage_boxes",
    {
      title: "List Storage Boxes",
      description: `List all Storage Boxes in the account.

Returns all Storage Boxes with their:
- Name and ID
- Login name and product type
- Location
- Storage usage and quota
- Enabled protocols (SSH, WebDAV, Samba, ZFS)`,
      inputSchema: z.object({
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
        const data = await makeStorageBoxApiRequest<ListStorageBoxesResponse>("/storage_boxes");
        const boxes = data.storage_boxes;

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(boxes, null, 2) }]
          };
        }

        if (boxes.length === 0) {
          return {
            content: [{ type: "text", text: "No Storage Boxes found." }]
          };
        }

        const lines = ["# Storage Boxes", "", `Found ${boxes.length} storage box(es):`, ""];
        for (const box of boxes) {
          lines.push(formatStorageBox(box));
          lines.push("");
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
        const data = await makeStorageBoxApiRequest<GetStorageBoxResponse>(`/storage_boxes/${params.id}`);
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
      description: `List all subaccounts for a specific Storage Box.

Returns all subaccounts with their:
- Username and home directory
- Enabled protocols (SSH, WebDAV, Samba)
- External reachability and read-only status`,
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
        const data = await makeStorageBoxApiRequest<ListStorageBoxSubaccountsResponse>(
          `/storage_boxes/${params.id}/subaccounts`
        );
        const subaccounts = data.subaccounts;

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(subaccounts, null, 2) }]
          };
        }

        if (subaccounts.length === 0) {
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
