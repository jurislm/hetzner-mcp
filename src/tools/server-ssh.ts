import { execFile } from "child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { makeApiRequest, handleApiError } from "../api.js";
import { ResponseFormat, ResponseFormatSchema, GetServerResponseSchema } from "../types.js";

/**
 * Resolves SHA256 fingerprints of all host SSH key types via ssh-keyscan + ssh-keygen.
 * Returns an array because a host advertises multiple key types (RSA, ECDSA, ed25519).
 * Exported so tests can inject a mock via the keyScanRunner DI parameter.
 */
export function runSshKeyScan(host: string, port: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    // Step 1: fetch raw host key entries (all key types)
    execFile(
      "ssh-keyscan",
      ["-p", String(port), "-T", "10", host],
      { timeout: 15_000 },
      (scanErr, scanOut, scanStderr) => {
        const rawKey = scanOut.trim();
        if (!rawKey) {
          reject(new Error(`ssh-keyscan failed: ${scanStderr.trim() || "no output"}`));
          return;
        }
        // Reject if ssh-keyscan exited non-zero even with partial stdout — data may be corrupt.
        if (scanErr) {
          reject(scanErr);
          return;
        }
        // Step 2: compute all fingerprints from the raw keys via ssh-keygen -l
        const proc = execFile(
          "ssh-keygen",
          ["-l", "-E", "sha256", "-f", "/dev/stdin"],
          { timeout: 10_000 },
          (keygenErr, keygenOut) => {
            if (keygenErr) { reject(keygenErr); return; }
            // Extract every SHA256:... token; include trailing '=' (base64 padding).
            const matches = [...keygenOut.matchAll(/SHA256:[A-Za-z0-9+/]+=*/g)].map(m => m[0]);
            if (matches.length === 0) {
              reject(new Error(`Could not parse fingerprint from: ${keygenOut.trim()}`));
              return;
            }
            resolve(matches);
          }
        );
        proc.stdin?.write(rawKey + "\n");
        proc.stdin?.end();
      }
    );
  });
}

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

  const parseCell = (cells: string[], index: number, label: string): number => {
    const value = Number.parseInt(cells[index] ?? "", 10);
    if (!Number.isFinite(value)) {
      throw new Error(`Unexpected output from \`free -m\`: invalid ${label}`);
    }
    return value;
  };

  const mem = memLine.trim().split(/\s+/);
  const total = parseCell(mem, 1, "Mem total");
  const used = parseCell(mem, 2, "Mem used");
  const free = parseCell(mem, 3, "Mem free");
  // Column 6 = "available" (after buff/cache adjustment); fall back to free
  const available = mem[6] !== undefined ? parseCell(mem, 6, "Mem available") : free;

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
      total: parseCell(sw, 1, "Swap total"),
      used: parseCell(sw, 2, "Swap used"),
      free: parseCell(sw, 3, "Swap free")
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

// sshRunner / keyScanRunner let tests inject mocks without fighting ESM binding.
export function registerServerSshTools(
  server: McpServer,
  sshRunner: typeof runSsh = runSsh,
  keyScanRunner: typeof runSshKeyScan = runSshKeyScan
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

⚠️ TOFU risk: uses StrictHostKeyChecking=accept-new. On the first connection to
a host, any key is automatically trusted (Trust-On-First-Use). An active MITM
attack on the first connection would go undetected. To prevent this, supply the
expected_fingerprint parameter (SHA256 format, e.g. "SHA256:abc123…"). When
provided, the host key fingerprint is verified via ssh-keyscan before connecting
and the connection is aborted if it does not match. For the highest security,
pre-register fingerprints in known_hosts and set StrictHostKeyChecking=yes in
your SSH config.

Returns used / total / available in MiB and overall usage %, plus swap state.`,
      inputSchema: z.object({
        id: z.number().int().positive()
          .describe("Server ID — used to resolve the public IPv4 address"),
        ssh_user: z.string()
          .regex(/^[a-zA-Z0-9._-]+$/, "ssh_user must contain only alphanumeric characters, dots, hyphens, or underscores")
          .default("root")
          .describe("SSH username (default: 'root')"),
        ssh_port: z.number().int().positive().max(65535).default(22)
          .describe("SSH port (default: 22)"),
        expected_fingerprint: z.string()
          .regex(/^SHA256:[A-Za-z0-9+/]+=*$/, "expected_fingerprint must be in SHA256:base64 format")
          .optional()
          .describe("Expected SSH host key fingerprint (e.g. 'SHA256:abc123…'). When provided, the host key is verified via ssh-keyscan before connecting. Strongly recommended to prevent TOFU MITM attacks."),
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
      // Zod defaults apply only via MCP framework validation; guard here for
      // direct handler calls (e.g., unit tests).
      const sshUser = params.ssh_user ?? "root";
      const sshPort = params.ssh_port ?? 22;

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
        if (!/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ipv4)) {
          return {
            content: [{ type: "text", text: `Error: Resolved IPv4 address has unexpected format: ${ipv4}` }],
            isError: true
          };
        }

        // Step 2: verify host fingerprint if caller supplied one
        if (params.expected_fingerprint) {
          let actualFps: string[];
          try {
            actualFps = await keyScanRunner(ipv4, sshPort);
          } catch (scanErr) {
            return {
              content: [{ type: "text", text: `Error: fingerprint verification failed: ${scanErr instanceof Error ? scanErr.message : String(scanErr)}` }],
              isError: true
            };
          }
          if (!actualFps.includes(params.expected_fingerprint)) {
            return {
              content: [{ type: "text", text: `Error: fingerprint mismatch for ${ipv4}. Expected: ${params.expected_fingerprint} — Got: ${actualFps.join(", ")}` }],
              isError: true
            };
          }
        }

        // Step 3: SSH and run free -m
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
        // sshUser matches /^[a-zA-Z0-9._-]+$/, ipv4 matches IPv4 regex, sshPort is a validated integer — interpolation is safe.
        lines.push(`*Source: \`free -m\` via ${sshUser}@${ipv4}:${sshPort}*`);

        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      } catch (error) {
        if (error instanceof Error) {
          const msg = error.message;
          if (msg.includes("Permission denied")) {
            return {
              content: [{ type: "text", text: `Error: SSH permission denied for '${sshUser}'. Check your SSH key is loaded (ssh-add).` }],
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
