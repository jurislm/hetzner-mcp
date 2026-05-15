import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  makeApiRequest,
  handleApiError,
  createPaginatedFetch,
  PAGINATION_HARD_CAP_PAGES,
  PartialFailure
} from "../api.js";
import {
  ResponseFormat,
  ListVolumesResponse,
  ListVolumesResponseSchema,
  GetVolumeResponseSchema,
  VolumeActionResponseSchema,
  HetznerVolume
} from "../types.js";

const ResponseFormatSchema = z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN);
const CLOUD_DEFAULT_PER_PAGE = 25;
const TRUNCATION_NOTE = `> ⚠️ Truncated at ${PAGINATION_HARD_CAP_PAGES} pages — supply explicit \`page\` to fetch more.`;

const paginatedFetch = createPaginatedFetch(makeApiRequest);

function formatVolume(vol: HetznerVolume): string {
  const lines = [
    `## ${vol.name} (ID: ${vol.id})`,
    `- **Status**: ${vol.status}`,
    `- **Size**: ${vol.size} GB`,
    `- **Location**: ${vol.location.city}, ${vol.location.country} (${vol.location.name})`,
    `- **Mount path**: ${vol.linux_device ?? "N/A"}`,
    `- **Attached server**: ${vol.server !== null ? `ID ${vol.server}` : "not attached"}`,
    `- **Format**: ${vol.format ?? "unknown"}`,
    `- **Delete protected**: ${vol.protection.delete ? "yes" : "no"}`,
    `- **Created**: ${new Date(vol.created).toLocaleString()}`
  ];

  if (Object.keys(vol.labels).length > 0) {
    lines.push(`- **Labels**: ${Object.entries(vol.labels).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }

  return lines.join("\n");
}

export function registerVolumeTools(server: McpServer): void {
  // List Volumes
  server.registerTool(
    "hetzner_list_volumes",
    {
      title: "List Volumes",
      description: `List all Cloud Volumes in the project.

By default fetches all pages (cap: ${PAGINATION_HARD_CAP_PAGES} pages × ${CLOUD_DEFAULT_PER_PAGE} per page = ${PAGINATION_HARD_CAP_PAGES * CLOUD_DEFAULT_PER_PAGE} volumes).
Supply explicit \`page\` and/or \`per_page\` to fetch a single page.

Returns volumes with their:
- Name and ID
- Status (available, creating)
- Size in GB
- Mount path (linux_device, e.g. /dev/disk/by-id/scsi-0HC_Volume_<id>)
- Attached server ID (null if not attached)
- Location`,
      inputSchema: z.object({
        page: z.number().int().positive().optional().describe("Page number (1-based). When set, fetches a single page only."),
        per_page: z.number().int().positive().max(50).optional().describe("Items per page (max 50). Default 25."),
        label_selector: z.string().optional().describe("Filter by label (e.g., 'env=production')"),
        status: z.string().optional().describe("Filter by volume status (known values: 'available', 'creating')"),
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
        let volumes: HetznerVolume[];
        let truncated = false;
        let partialFailure: PartialFailure | undefined;

        const filterParams: Record<string, unknown> = {};
        if (params.label_selector) filterParams.label_selector = params.label_selector;
        if (params.status) filterParams.status = params.status;

        if (params.page !== undefined) {
          const data = await makeApiRequest(
            "/volumes",
            ListVolumesResponseSchema,
            "GET",
            undefined,
            { page: params.page, per_page: params.per_page ?? CLOUD_DEFAULT_PER_PAGE, ...filterParams }
          );
          volumes = data.volumes;
        } else {
          const result = await paginatedFetch<ListVolumesResponse, HetznerVolume>(
            "/volumes",
            ListVolumesResponseSchema,
            (r) => r.volumes,
            params.per_page ?? CLOUD_DEFAULT_PER_PAGE,
            filterParams
          );
          volumes = result.items;
          truncated = result.truncated;
          partialFailure = result.partialFailure;
        }

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify({ volumes, truncated, partialFailure }, null, 2) }]
          };
        }

        if (volumes.length === 0 && !partialFailure) {
          return {
            content: [{ type: "text", text: "No volumes found." }]
          };
        }

        const lines = ["# Cloud Volumes", "", `Found ${volumes.length} volume(s):`, ""];
        for (const vol of volumes) {
          lines.push(formatVolume(vol));
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

  // Get Volume
  server.registerTool(
    "hetzner_get_volume",
    {
      title: "Get Volume",
      description: `Get detailed information about a specific Cloud Volume.

Useful for confirming the actual mount path (\`linux_device\`) before setting up Docker bind mounts or fstab entries.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Volume ID"),
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
        const data = await makeApiRequest(`/volumes/${params.id}`, GetVolumeResponseSchema);
        const vol = data.volume;

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(vol, null, 2) }]
          };
        }

        return {
          content: [{ type: "text", text: ["# Volume Details", "", formatVolume(vol)].join("\n") }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // Attach Volume
  server.registerTool(
    "hetzner_attach_volume",
    {
      title: "Attach Volume",
      description: `Attach a Cloud Volume to a server.

The server must be in the same location as the volume. The volume must be in \`available\` status (not already attached).

After attaching, the volume is accessible at its \`linux_device\` path (e.g. \`/dev/disk/by-id/scsi-0HC_Volume_<id>\`). You still need to mount it inside the OS.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Volume ID to attach"),
        server_id: z.number().int().positive().describe("The server ID to attach the volume to"),
        automount: z.boolean().optional().describe("Auto-mount the volume after attach (default false)"),
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
        const body: Record<string, unknown> = { server: params.server_id };
        if (params.automount !== undefined) body.automount = params.automount;

        const data = await makeApiRequest(
          `/volumes/${params.id}/actions/attach`,
          VolumeActionResponseSchema,
          "POST",
          body
        );

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(data.action, null, 2) }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `Volume ${params.id} is being attached to server ${params.server_id}. Action status: ${data.action.status}`
          }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );

  // Detach Volume
  server.registerTool(
    "hetzner_detach_volume",
    {
      title: "Detach Volume",
      description: `Detach a Cloud Volume from its server.

⚠️ Ensure the volume is unmounted inside the OS before detaching to avoid data corruption.

After detaching, the volume status returns to \`available\` and can be attached to another server.`,
      inputSchema: z.object({
        id: z.number().int().positive().describe("The Volume ID to detach"),
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
        const data = await makeApiRequest(
          `/volumes/${params.id}/actions/detach`,
          VolumeActionResponseSchema,
          "POST"
        );

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{ type: "text", text: JSON.stringify(data.action, null, 2) }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `Volume ${params.id} is being detached. Action status: ${data.action.status}`
          }]
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
