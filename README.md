# Hetzner MCP Server

[![npm version](https://badge.fury.io/js/%40jurislm%2Fhetzner-mcp.svg)](https://www.npmjs.com/package/@jurislm/hetzner-mcp)

An MCP server that gives Claude Code 40 tools to manage Hetzner Cloud — servers, SSH keys, Cloud Volumes, Storage Boxes, and live metrics.

---

## Quick Start

```bash
npm install -g @jurislm/hetzner-mcp
```

Add to your Claude Code MCP config (usually `~/.claude.json` — run `/mcp` to confirm the location):

```json
{
  "mcpServers": {
    "hetzner": {
      "type": "stdio",
      "command": "npx",
      "args": ["@jurislm/hetzner-mcp"],
      "env": {
        "HETZNER_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

Restart Claude Code. Done.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HETZNER_API_TOKEN` | ✅ | Cloud API token — Read & Write. Generate at [console.hetzner.cloud](https://console.hetzner.cloud) → project → Security → API Tokens. |
| `HETZNER_API_TOKEN_UNIFIED` | Storage Boxes only | Unified API token for Storage Box tools. Generate at [console.hetzner.com/account/security/api-tokens](https://console.hetzner.com/account/security/api-tokens). Falls back to `HETZNER_API_TOKEN` if unset, but a Cloud project token will return `401`. |

### Why two tokens?

Storage Box tools call `api.hetzner.com/v1` (unified API), while all other tools call `api.hetzner.cloud/v1` (Cloud API). The two endpoints use different token namespaces. If you want the simplest setup, generate a single unified token from `console.hetzner.com` and use it for both variables.

---

## Available Tools (40 total)

### Servers (7)

| Tool | Description | ⚠️ |
|------|-------------|:---:|
| `hetzner_list_servers` | List all servers — status, IPs, specs, location | |
| `hetzner_get_server` | Get full details for one server | |
| `hetzner_create_server` | Create a new server (billed immediately) | |
| `hetzner_delete_server` | Permanently delete a server and all its data | ⚠️ |
| `hetzner_power_on_server` | Power on a stopped server | |
| `hetzner_power_off_server` | Hard power off (equivalent to pulling the power cord) | ⚠️ |
| `hetzner_reboot_server` | Hard reboot (equivalent to pressing the reset button) | ⚠️ |

### SSH Keys (4)

| Tool | Description | ⚠️ |
|------|-------------|:---:|
| `hetzner_list_ssh_keys` | List all SSH keys in the project | |
| `hetzner_get_ssh_key` | Get details for one SSH key | |
| `hetzner_create_ssh_key` | Add a new SSH public key | |
| `hetzner_delete_ssh_key` | Remove an SSH key | ⚠️ |

### Reference (3)

| Tool | Description |
|------|-------------|
| `hetzner_list_server_types` | Available server sizes with CPU, RAM, disk, and pricing |
| `hetzner_list_images` | Available OS images |
| `hetzner_list_locations` | Available datacenters and their locations |

### Cloud Volumes (4)

| Tool | Description | ⚠️ |
|------|-------------|:---:|
| `hetzner_list_volumes` | List all volumes — size, mount path, attached server | |
| `hetzner_get_volume` | Get details for one volume | |
| `hetzner_attach_volume` | Attach a volume to a server | ⚠️ |
| `hetzner_detach_volume` | Detach a volume from its server | ⚠️ |

### Server Metrics (1)

| Tool | Description |
|------|-------------|
| `hetzner_get_server_metrics` | CPU, disk I/O, and network metrics — defaults to the last 5 minutes |

### Server RAM via SSH (1)

| Tool | Description |
|------|-------------|
| `hetzner_get_server_ram` | SSH into the server and run `free -m` to get RAM and swap usage (the Hetzner Metrics API does not expose memory metrics) |

**Prerequisites for `hetzner_get_server_ram`:** the server's public IPv4 must be reachable and the SSH private key must be available in the system SSH agent or `~/.ssh/`.

### Storage Boxes (20) — requires `HETZNER_API_TOKEN_UNIFIED`

#### Core

| Tool | Description | ⚠️ |
|------|-------------|:---:|
| `hetzner_list_storage_boxes` | List all Storage Boxes (auto-paginates) | |
| `hetzner_get_storage_box` | Get details for one Storage Box | |
| `hetzner_create_storage_box` | Create a new Storage Box (billed immediately) | |
| `hetzner_update_storage_box` | Update name or labels | |
| `hetzner_delete_storage_box` | Permanently delete a Storage Box | ⚠️ |
| `hetzner_change_storage_box_type` | Upgrade or downgrade the Storage Box plan | ⚠️ |
| `hetzner_change_storage_box_protection` | Enable or disable delete protection | |
| `hetzner_reset_storage_box_password` | Reset the Storage Box password | ⚠️ |
| `hetzner_update_storage_box_access_settings` | Configure SSH / Samba / WebDAV / ZFS / external access | |

#### Folders

| Tool | Description |
|------|-------------|
| `hetzner_list_storage_box_folders` | List folders inside a Storage Box |

#### Subaccounts

| Tool | Description | ⚠️ |
|------|-------------|:---:|
| `hetzner_list_storage_box_subaccounts` | List subaccounts (auto-paginates) | |
| `hetzner_create_storage_box_subaccount` | Create a subaccount with scoped access | |
| `hetzner_update_storage_box_subaccount` | Update subaccount settings | |
| `hetzner_delete_storage_box_subaccount` | Delete a subaccount | ⚠️ |

#### Snapshots

| Tool | Description | ⚠️ |
|------|-------------|:---:|
| `hetzner_list_storage_box_snapshots` | List snapshots (auto-paginates) | |
| `hetzner_create_storage_box_snapshot` | Trigger an on-demand snapshot | |
| `hetzner_delete_storage_box_snapshot` | Delete a snapshot | ⚠️ |
| `hetzner_rollback_storage_box_snapshot` | Roll back to a snapshot — overwrites current data | ⚠️ |
| `hetzner_enable_storage_box_snapshot_plan` | Enable automatic scheduled snapshots | |
| `hetzner_disable_storage_box_snapshot_plan` | Disable automatic scheduled snapshots | |

---

## Capabilities and Limitations

**This MCP can:**
- Create, manage, and monitor servers
- Manage SSH keys, Cloud Volumes, and Storage Boxes
- Report CPU, disk I/O, network, and RAM usage

**This MCP cannot:**
- Create Hetzner projects (do that in the web console)
- Manage billing, firewalls, load balancers, floating IPs, or networks
- See resources outside the project whose token you provide

> ⚠️ **Creating servers costs real money.** Hetzner bills by the hour — a `cx22` runs ~€0.006/hr (~€4/mo), a `cx52` runs ~€0.119/hr (~€86/mo). Always delete servers you are not using.

---

## Troubleshooting

**`HETZNER_API_TOKEN environment variable is required`** — token is missing from the MCP config env block. Restart Claude Code after adding it.

**`401 Unauthorized` on Storage Box tools** — you need a unified token from `console.hetzner.com/account/security/api-tokens`, not a Cloud project token. Set it as `HETZNER_API_TOKEN_UNIFIED`.

**`hetzner_get_server_ram` connection error** — check that the server is running, port 22 is reachable, and `ssh_user` (default `root`) has SSH access via a key loaded in the agent.

---

## Development

```bash
bun install
bun run build       # compile TypeScript to dist/
bun run dev         # watch mode
bun run test        # vitest
bun run typecheck   # tsc --noEmit
bun run lint        # eslint --max-warnings=0
```

To test locally without publishing:

```bash
HETZNER_API_TOKEN="your-token" bun dist/index.js
```

---

## License

MIT
