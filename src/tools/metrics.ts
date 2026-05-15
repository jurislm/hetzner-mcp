import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeApiRequest, handleApiError } from "../api.js";
import {
  ResponseFormat,
  ResponseFormatSchema,
  ServerMetricsResponseSchema,
  GetServerResponseSchema
} from "../types.js";

type TimeSeriesValues = [number, string][];

function parseValues(values: TimeSeriesValues): number[] {
  return values
    .map(([, v]) => parseFloat(v))
    .filter((v) => !isNaN(v));
}

function seriesStats(nums: number[]): { latest: number; avg: number; max: number } | null {
  if (nums.length === 0) return null;
  const latest = nums[nums.length - 1];
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const max = Math.max(...nums);
  return { latest, avg, max };
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

export function registerMetricsTools(server: McpServer): void {
  server.registerTool(
    "hetzner_get_server_metrics",
    {
      title: "Get Server Metrics",
      description: `Get real-time performance metrics for a server (CPU, disk I/O, network).

Queries the Hetzner Metrics API and returns summarised stats:
- **cpu**: current usage %, period average, peak (auto-calculated from core count)
- **disk**: read/write bandwidth (MB/s) and IOPS for the first disk
- **network**: inbound/outbound bandwidth (Mbps) for the first interface

Default window: last 5 minutes, 60-second step.
Metrics are retained for 30 days; step is auto-adjusted to a max of 500 samples.`,
      inputSchema: z.object({
        id: z.number().int().positive()
          .describe("Server ID"),
        type: z.array(z.enum(["cpu", "disk", "network"]))
          .min(1)
          .default(["cpu"])
          .describe("Metric types to fetch (default: [\"cpu\"])"),
        start: z.string().optional()
          .describe("Start of the period in ISO 8601 format. Defaults to 5 minutes ago."),
        end: z.string().optional()
          .describe("End of the period in ISO 8601 format. Defaults to now."),
        step: z.number().int().positive().optional()
          .describe("Sampling interval in seconds (default: 60). Max 500 samples returned."),
        response_format: ResponseFormatSchema.describe("Output format: 'markdown' or 'json'")
      }).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params) => {
      try {
        const now = new Date();
        const start = params.start ?? new Date(now.getTime() - 5 * 60 * 1000).toISOString();
        const end = params.end ?? now.toISOString();
        const step = params.step ?? 60;

        const startMs = Date.parse(start);
        const endMs = Date.parse(end);
        if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
          throw new Error("start and end must be valid ISO 8601 datetimes");
        }
        if (startMs >= endMs) {
          throw new Error("start must be earlier than end");
        }

        const types = params.type;

        // Fetch metrics and server info (for CPU core count) in parallel.
        // Server info is only needed when cpu is in the type list.
        const [metricsData, serverData] = await Promise.all([
          makeApiRequest(
            `/servers/${params.id}/metrics`,
            ServerMetricsResponseSchema,
            "GET",
            undefined,
            { type: types.join(","), start, end, step }
          ),
          types.includes("cpu")
            ? makeApiRequest(`/servers/${params.id}`, GetServerResponseSchema)
            : Promise.resolve(null)
        ]);

        const { time_series, step: actualStep } = metricsData.metrics;
        const cores = serverData?.server.server_type.cores ?? null;

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ ...metricsData.metrics, cores }, null, 2)
            }]
          };
        }

        const lines: string[] = [
          `# Server ${params.id} — Metrics`,
          ""
        ];

        // ── CPU ──────────────────────────────────────────────────────────────
        if (types.includes("cpu")) {
          lines.push("## CPU 使用率");
          const cpuEntry = time_series["cpu"];
          const nums = cpuEntry
            ? parseValues(cpuEntry.values as TimeSeriesValues)
            : [];
          const s = seriesStats(nums);

          if (s !== null && cores !== null) {
            const maxRaw = cores * 100;
            lines.push(`- **最新** : ${fmt(s.latest / cores)}%（${fmt(s.latest)} / ${maxRaw}，${cores} 核）`);
            lines.push(`- **平均** : ${fmt(s.avg / cores)}%`);
            lines.push(`- **最高** : ${fmt(s.max / cores)}%`);
          } else if (s !== null) {
            // Core count unavailable — display raw value
            lines.push(`- **最新** : ${fmt(s.latest)}`);
            lines.push(`- **平均** : ${fmt(s.avg)}`);
            lines.push(`- **最高** : ${fmt(s.max)}`);
          } else {
            lines.push("- No CPU data in the requested time range.");
          }
          lines.push("");
        }

        // ── Disk ─────────────────────────────────────────────────────────────
        if (types.includes("disk")) {
          lines.push("## 磁碟 I/O");
          const bwRead = time_series["disk.0.bandwidth.read"];
          const bwWrite = time_series["disk.0.bandwidth.write"];
          const iopsRead = time_series["disk.0.iops.read"];
          const iopsWrite = time_series["disk.0.iops.write"];
          let hasData = false;

          if (bwRead) {
            const s = seriesStats(parseValues(bwRead.values as TimeSeriesValues));
            if (s) { lines.push(`- **Read bandwidth**  : ${fmt(s.latest / 1_048_576, 2)} MB/s`); hasData = true; }
          }
          if (bwWrite) {
            const s = seriesStats(parseValues(bwWrite.values as TimeSeriesValues));
            if (s) { lines.push(`- **Write bandwidth** : ${fmt(s.latest / 1_048_576, 2)} MB/s`); hasData = true; }
          }
          if (iopsRead) {
            const s = seriesStats(parseValues(iopsRead.values as TimeSeriesValues));
            if (s) { lines.push(`- **Read IOPS**       : ${fmt(s.latest, 0)} ops/s`); hasData = true; }
          }
          if (iopsWrite) {
            const s = seriesStats(parseValues(iopsWrite.values as TimeSeriesValues));
            if (s) { lines.push(`- **Write IOPS**      : ${fmt(s.latest, 0)} ops/s`); hasData = true; }
          }
          if (!hasData) {
            lines.push("- No disk data in the requested time range.");
          }
          lines.push("");
        }

        // ── Network ──────────────────────────────────────────────────────────
        if (types.includes("network")) {
          lines.push("## 網路");
          const bwIn = time_series["network.0.bandwidth.in"];
          const bwOut = time_series["network.0.bandwidth.out"];
          let hasData = false;

          if (bwIn) {
            const s = seriesStats(parseValues(bwIn.values as TimeSeriesValues));
            if (s) { lines.push(`- **In**  : ${fmt(s.latest * 8 / 1_000_000, 2)} Mbps`); hasData = true; }
          }
          if (bwOut) {
            const s = seriesStats(parseValues(bwOut.values as TimeSeriesValues));
            if (s) { lines.push(`- **Out** : ${fmt(s.latest * 8 / 1_000_000, 2)} Mbps`); hasData = true; }
          }
          if (!hasData) {
            lines.push("- No network data in the requested time range.");
          }
          lines.push("");
        }

        lines.push("---");
        lines.push(`*Period: ${metricsData.metrics.start} → ${metricsData.metrics.end} (step ${actualStep}s)*`);

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
