import { execFile } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeApiRequest, handleApiError } from "../api.js";
import { ResponseFormat, GetServerResponseSchema } from "../types.js";

const ResponseFormatSchema = z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN);

export interface RamStats {
  total: number;
  used: number;
  free: number;
  available: number;
  usedPercent: number;
}

export interface SwapStats {
  total: number;
  used: number;
  free: number;
}

export interface FreeOutput {
  ram: RamStats;
  swap: SwapStats | null;
}

/**
 * Parses the stdout of `free -m` into structured stats.
 * Exported for direct unit testing (pure function, no I/O).
 */
export function parseFreeOutput(output: string): FreeOutput {
  const lines = output.trim().split("\n");
  const memLine = lines.find((l) => l.startsWith("Mem:"));
  const swapLine = lines.find((l) => l.startsWith("Swap:"));

  if (!memLine) {
    throw new Error("Unexpected output from `free -m`: Mem: line not found");
  }

  const mem = memLine.trim().split(/\s+/);
  const total = parseInt(mem[1], 10);
  const used = parseInt(mem[2], 10);
  const free = parseInt(mem[3], 10);
  // Column 6 = "available" (after buff/cache adjustment); fall back to free
  const available = mem[6] !== undefined ? parseInt(mem[6], 10) : free;

  const ram: RamStats = {
    total,
    used,
    free,
    available,
    usedPercent: total > 0 ? (used / total) * 100 : 0
  };

  let swap: SwapStats | null = null;
  if (swapLine) {
    const sw = swapLine.trim().split(/\s+/);
    swap = {
      total: parseInt(sw[1], 10),
      used: parseInt(sw[2], 10),
      free: parseInt(sw[3], 10)
    };
  }

  return { ram, swap };
}

function fmtMiB(n: number): string {
  return n.toLocaleString("en-US");
}

// Thin wrapper around child_process.execFile — kept as a named export so
// tests can intercept it without having to mock the whole child_process module.
export function runSsh(
  host: string,
  port: number,
  user: string,
  command: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "ssh",
      [
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=accept-new",
        "-p", String(port),
        `${user}@${host}`,
        command
      ],
      { timeout: 15_000 },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      }
    );
  });
}

// The sshRunner parameter lets tests inject a mock without fighting ESM binding.
// Production callers omit it — the real runSsh is used by default.
export function registerServerSshTools(
  server: McpServer,
  sshRunner: typeof runSsh = runSsh
): void {
  server.registerTool(
    "hetzner_get_server_ram",
    {
      title: "Get Server RAM",
      description: `Query a server's RAM and swap usage via SSH.

The Hetzner Metrics API does not expose memory metrics — this tool SSHes into
the server, runs \`free -m\`, and returns a human-readable summary.

Prerequisites:
- The server's public IPv4 must be reachable from this machine.
- The SSH private key must be available in the system SSH agent or ~/.ssh
  (the tool calls the system \`ssh\` binary directly).

Returns used / total / available in MiB and overall usage %, plus swap state.`,
      inputSchema: z.object({
        id: z.number().int().positive()
          .describe("Server ID — used to resolve the public IPv4 address"),
        ssh_user: z.string().default("root")
          .describe("SSH username (default: 'root')"),
        ssh_port: z.number().int().positive().max(65535).default(22)
          .describe("SSH port (default: 22)"),
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
        // Step 1: resolve public IPv4 from server ID
        const serverData = await makeApiRequest(
          `/servers/${params.id}`,
          GetServerResponseSchema
        );
        const ipv4 = serverData.server.public_net.ipv4?.ip;
        if (!ipv4) {
          return {
            content: [{ type: "text", text: "Error: Server has no public IPv4 address." }],
            isError: true
          };
        }

        // Zod defaults apply only via MCP framework validation; guard here for
        // direct handler calls (e.g., unit tests).
        const sshUser = params.ssh_user ?? "root";
        const sshPort = params.ssh_port ?? 22;

        // Step 2: SSH and run free -m
        const stdout = await sshRunner(ipv4, sshPort, sshUser, "free -m");
        const { ram, swap } = parseFreeOutput(stdout);

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify(
                { server: { id: params.id, ipv4 }, ram, swap },
                null,
                2
              )
            }]
          };
        }

        const lines: string[] = [
          `# Server ${params.id} — RAM`,
          "",
          "## RAM 使用率",
          `- **已用**   : ${fmtMiB(ram.used)} MiB`,
          `- **總量**   : ${fmtMiB(ram.total)} MiB`,
          `- **使用率** : ${ram.usedPercent.toFixed(1)}%`,
          `- **可用**   : ${fmtMiB(ram.available)} MiB`,
          "",
          "## Swap"
        ];

        if (swap === null || swap.total === 0) {
          lines.push("- **狀態** : 未配置（正常）");
        } else {
          const swapPct = swap.total > 0 ? (swap.used / swap.total) * 100 : 0;
          lines.push(`- **已用**   : ${fmtMiB(swap.used)} MiB`);
          lines.push(`- **總量**   : ${fmtMiB(swap.total)} MiB`);
          lines.push(`- **使用率** : ${swapPct.toFixed(1)}%`);
        }

        lines.push("");
        lines.push(`*Source: \`free -m\` via ${sshUser}@${ipv4}:${sshPort}*`);

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        if (error instanceof Error) {
          const msg = error.message;
          if (msg.includes("Permission denied")) {
            return {
              content: [{ type: "text", text: `Error: SSH permission denied for '${params.ssh_user}'. Check your SSH key is loaded (ssh-add).` }],
              isError: true
            };
          }
          if (msg.includes("timed out") || msg.includes("Connection timed out")) {
            return {
              content: [{ type: "text", text: "Error: SSH connection timed out. Check the server is reachable and SSH is running." }],
              isError: true
            };
          }
          if (msg.includes("Connection refused")) {
            return {
              content: [{ type: "text", text: "Error: SSH connection refused. Check that sshd is running on the server." }],
              isError: true
            };
          }
          if (msg.includes("ENOENT")) {
            return {
              content: [{ type: "text", text: "Error: 'ssh' binary not found. Please install OpenSSH client." }],
              isError: true
            };
          }
        }
        return {
          content: [{ type: "text", text: handleApiError(error) }],
          isError: true
        };
      }
    }
  );
}
