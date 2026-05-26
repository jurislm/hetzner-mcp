# Hetzner MCP Server

[![npm version](https://badge.fury.io/js/%40jurislm%2Fhetzner-mcp.svg)](https://www.npmjs.com/package/@jurislm/hetzner-mcp)

An MCP server that lets Claude Code manage your Hetzner Cloud infrastructure — servers, SSH keys, Cloud Volumes, Storage Boxes, and live metrics.

```bash
npm install -g @jurislm/hetzner-mcp
```

---

## What is MCP?

**MCP (Model Context Protocol)** is a way for AI assistants like Claude to interact with external services and APIs. Think of it like giving Claude "hands" to do things on your behalf.

**How it works:**
1. You install an MCP server (like this one) on your computer
2. You configure Claude Code to use it
3. Claude can now use "tools" that the MCP server provides
4. When you ask Claude to "create a server", it uses these tools to actually do it

---

## What is Hetzner Cloud?

[Hetzner](https://www.hetzner.com/cloud) is a cloud hosting provider (like AWS, DigitalOcean, or Linode) where you can rent virtual servers. You pay by the hour for the servers you use.

### What is a "Project" in Hetzner?

A **Project** is like a folder or container that groups related resources together. When you sign up for Hetzner Cloud:

1. You create **Projects** to organize your work (e.g., "My Blog", "Client Website", "Test Environment")
2. Inside each project, you create **Servers** (the actual virtual machines)
3. Each project also contains related resources: SSH keys, firewall rules, volumes, etc.

Each project is completely separate — servers in one project can't see servers in another.

---

## What Can This MCP Do?

### It CAN:
- **Create and manage servers** (this costs money!)
- **Power on/off/reboot servers**
- **List servers** with their IPs, status, and specs
- **Manage SSH keys** used to log into servers
- **Manage Cloud Volumes** — attach/detach persistent block storage
- **Monitor server performance** — CPU, disk I/O, network, and RAM usage
- **Manage Storage Boxes** — full CRUD for Hetzner's backup/archive storage
- **Show available options** (server types, OS images, datacenter locations)

### It CANNOT:
- Create new Projects (you do that manually in the Hetzner web console)
- Manage billing or payment methods
- Access other projects (it only sees the project whose token you provide)
- Manage firewalls, load balancers, floating IPs, or networks (not implemented)

### Important: This Can Spend Your Money!

When you create a server through this MCP, **Hetzner will charge you real money**. Servers are billed hourly. For example:
- A small `cx22` server costs ~€0.006/hour (~€4/month)
- A larger `cx52` server costs ~€0.119/hour (~€86/month)

Always check pricing with `hetzner_list_server_types` before creating servers, and **delete servers you're not using** to avoid charges.

---

## Hetzner MCP + Kamal = Your Own PaaS

Combine this MCP with [Kamal](https://kamal-deploy.org/) (DHH's deployment tool) and the [kamal-deploy skill](https://github.com/nityeshaga/claude-code-essentials/tree/main/plugins/basics/skills/kamal-deploy) to get a complete deployment platform inside Claude Code.

**The mental model:**
- **Hetzner MCP** = Provisions the servers (the computers)
- **Kamal** = Deploys your app to those servers (the software)
- **Together** = Your own Vercel/Render/Hatchbox alternative

### Feature Comparison

| Feature | Hetzner MCP + Kamal | Hatchbox | Vercel | Render |
|---------|---------------------|----------|--------|--------|
| **Create/manage servers** | ✅ Via MCP | ✅ Web UI | ❌ Serverless | ✅ Managed |
| **Deploy apps** | ✅ Kamal | ✅ Git push | ✅ Git push | ✅ Git push |
| **Zero-downtime deploys** | ✅ | ✅ | ✅ | ✅ |
| **SSL certificates** | ✅ Let's Encrypt | ✅ Auto | ✅ Auto | ✅ Auto |
| **Databases** | ✅ Kamal accessories | ✅ Managed | ❌ External | ✅ Managed |
| **Redis** | ✅ Kamal accessories | ✅ Managed | ❌ External | ✅ Managed |
| **Background jobs** | ✅ Kamal workers | ✅ Sidekiq | ⚠️ Cron only | ✅ Workers |
| **Rollback** | ✅ `kamal rollback` | ✅ One-click | ✅ One-click | ✅ One-click |
| **Custom domains** | ✅ | ✅ | ✅ | ✅ |
| **SSH access to server** | ✅ Full root | ✅ Limited | ❌ None | ❌ None |
| **Docker support** | ✅ Native | ❌ No | ✅ Yes | ✅ Yes |
| **Non-Ruby apps** | ✅ Any Docker app | ❌ Ruby only | ✅ Any | ✅ Any |
| **Multiple apps per server** | ✅ Manual | ✅ Clusters | N/A | N/A |
| **Web UI dashboard** | ❌ CLI only | ✅ | ✅ | ✅ |
| **Automatic backups** | ❌ DIY | ✅ | N/A | ✅ |
| **Managed security updates** | ❌ DIY | ✅ | ✅ | ✅ |
| **Monitoring/alerts** | ❌ DIY | ✅ | ✅ | ✅ |

### Cost Comparison (typical Rails app)

| Platform | Monthly Cost | What You Get |
|----------|--------------|--------------|
| **Hetzner + Kamal** | ~€4-8/mo | Full server, unlimited apps |
| **Hatchbox** | $10-29/mo + server | Managed Rails deployment |
| **Vercel** | $20+/mo | Serverless, limited compute |
| **Render** | $7-25/mo per service | Managed containers |

---

## How Authentication Works

### The API Token

To use Hetzner's API, you need an **API Token**. This is like a password that:
1. Proves you are who you say you are
2. Grants access to a specific project
3. Has permission levels (read-only or read+write)

**One token = One project.** If you have 3 projects and want Claude to manage all of them, you'd need 3 different tokens (and 3 MCP configurations).

### Token Permissions

When you create a token, you choose its permissions:
- **Read**: Can view servers, list resources, but can't change anything
- **Read & Write**: Can view AND create/delete/modify resources

For this MCP to be useful, you need **Read & Write** permissions.

### Security Considerations

Your API token is powerful — anyone with it can create/delete servers in your project. Keep it safe:

1. **Never share your token** or commit it to git
2. **Store it in environment variables**, not in code
3. **Use a dedicated project for testing** so mistakes don't affect production
4. **Delete unused tokens** in the Hetzner console
5. **Review what Claude is doing** before confirming destructive actions

### Storage Boxes — Different Token Required

Storage Box tools use Hetzner's **unified API** at `api.hetzner.com/v1`, which is **not** the same as the Cloud API used by all other tools. The two APIs accept different token classes:

| Tool category | API endpoint | Token source |
|---|---|---|
| Servers, SSH keys, Volumes, Metrics | `api.hetzner.cloud/v1` | [Cloud project tokens](https://console.hetzner.cloud) |
| Storage Boxes | `api.hetzner.com/v1` | [Account-level unified tokens](https://console.hetzner.com/account/security/api-tokens) |

**A Cloud-project token does NOT authenticate against the unified API.** If you only set `HETZNER_API_TOKEN` to a Cloud token, Storage Box tools will return `401 Unauthorized`.

**Two ways to configure:**

1. **Single unified token (simplest)**: Generate a unified token from `console.hetzner.com/account/security/api-tokens` and set `HETZNER_API_TOKEN` to it. The unified token authenticates against both APIs.
2. **Separate tokens (recommended for least-privilege)**: Set `HETZNER_API_TOKEN` to a Cloud-project token AND `HETZNER_API_TOKEN_UNIFIED` to a unified token. The Storage Box client will prefer `HETZNER_API_TOKEN_UNIFIED`.

If neither variable is set when a Storage Box tool is invoked, you'll get a clear error pointing at the unified-token console URL.

---

## Getting an API Token

1. Go to [Hetzner Cloud Console](https://console.hetzner.cloud/projects)
2. Click on the project you want to manage (or create a new one)
3. In the left sidebar, click **Security**
4. Click **API Tokens**
5. Click **Generate API Token**
6. Enter a name (e.g., "Claude Code MCP")
7. Select **Read & Write** permissions
8. Click **Generate API Token**
9. **Copy the token immediately** — it won't be shown again!

---

## Installation

### Prerequisites
- Node.js 18 or higher
- npm
- A Hetzner Cloud account with an API token

### Option 1: Install from npm (Recommended)

```bash
npm install -g @jurislm/hetzner-mcp
```

Then configure Claude Code to use it (see below).

### Option 2: Clone and Build

```bash
git clone https://github.com/jurislm/hetzner-mcp.git
cd hetzner-mcp
npm install
npm run build
```

---

## Configuring Claude Code

Add the MCP server config to **`~/.claude.json`** (your user-level Claude Code config file).

> **Important:** The config goes in `~/.claude.json`, NOT `~/.claude/settings.json` or `~/.claude/.mcp.json`. Run `/mcp` in Claude Code to verify the correct config location for your setup.

### If installed via npm (Option 1):

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

For Storage Box tools, also add the unified token:

```json
{
  "mcpServers": {
    "hetzner": {
      "type": "stdio",
      "command": "npx",
      "args": ["@jurislm/hetzner-mcp"],
      "env": {
        "HETZNER_API_TOKEN": "your-cloud-project-token",
        "HETZNER_API_TOKEN_UNIFIED": "your-unified-token"
      }
    }
  }
}
```

If you already have other MCP servers configured, just add `hetzner` alongside them.

### If cloned from GitHub (Option 2):

```json
{
  "mcpServers": {
    "hetzner": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/hetzner-mcp/dist/index.js"],
      "env": {
        "HETZNER_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

Replace `/path/to/hetzner-mcp` with the actual path where you cloned the repo, then **restart Claude Code**.

---

## Using the MCP

Once configured, you can talk to Claude naturally:

### Viewing Resources
- "List all my servers"
- "Show me server 12345"
- "What SSH keys do I have?"
- "What server types are available and how much do they cost?"
- "What locations can I deploy to?"
- "What OS images are available?"
- "Show me my Cloud Volumes"

### Creating Servers
- "Create a new server called my-app with Ubuntu 24.04"
- "Spin up a cx22 server in Falkenstein running Debian"
- "Create a server named test-server with my SSH key attached"

### Managing Servers
- "Power off server 12345"
- "Reboot my-app server"
- "Delete the test-server" (be careful — this is permanent!)

### Monitoring
- "Get CPU and disk metrics for server 12345"
- "Check RAM usage on my-app via SSH"

### Managing SSH Keys
- "Add my SSH public key"
- "List my SSH keys"
- "Delete SSH key 789"

### Managing Storage Boxes
- "List my storage boxes"
- "Create a snapshot of storage box 561406"
- "Show me the subaccounts for box 561406"

---

## Available Tools (40 total)

### Servers (7)
| Tool | What it does | Destructive? |
|------|--------------|:---:|
| `hetzner_list_servers` | Lists all servers with status, IPs, specs | |
| `hetzner_get_server` | Gets details of one server | |
| `hetzner_create_server` | Creates a new server (costs money!) | |
| `hetzner_delete_server` | Permanently deletes a server | ⚠️ |
| `hetzner_power_on_server` | Turns on a powered-off server | |
| `hetzner_power_off_server` | Hard power off (like pulling the plug) | ⚠️ |
| `hetzner_reboot_server` | Hard reboot (like pressing reset button) | ⚠️ |

### SSH Keys (4)
| Tool | What it does | Destructive? |
|------|--------------|:---:|
| `hetzner_list_ssh_keys` | Lists all SSH keys in the project | |
| `hetzner_get_ssh_key` | Gets details of one SSH key | |
| `hetzner_create_ssh_key` | Adds a new SSH public key | |
| `hetzner_delete_ssh_key` | Removes an SSH key | ⚠️ |

### Reference (3)
| Tool | What it does |
|------|--------------|
| `hetzner_list_server_types` | Shows available sizes and prices |
| `hetzner_list_images` | Shows available operating systems |
| `hetzner_list_locations` | Shows available datacenters |

### Cloud Volumes (4)
| Tool | What it does | Destructive? |
|------|--------------|:---:|
| `hetzner_list_volumes` | Lists all Volumes (size, mount path, attached server) | |
| `hetzner_get_volume` | Gets details of one Volume | |
| `hetzner_attach_volume` | Attaches a Volume to a server | ⚠️ |
| `hetzner_detach_volume` | Detaches a Volume from its server | ⚠️ |

### Server Metrics (1)
| Tool | What it does |
|------|--------------|
| `hetzner_get_server_metrics` | Gets CPU, disk I/O, and network metrics (default: last 5 min) |

### Server RAM via SSH (1)
| Tool | What it does |
|------|--------------|
| `hetzner_get_server_ram` | SSHes into the server and runs `free -m` to get RAM/swap usage (Hetzner Metrics API does not expose memory) |

### Storage Boxes (20) — requires unified API token

Storage Box tools use the unified API (`api.hetzner.com/v1`). Set `HETZNER_API_TOKEN_UNIFIED` to a token from `console.hetzner.com/account/security/api-tokens`.

#### Core Operations
| Tool | What it does | Destructive? |
|------|--------------|:---:|
| `hetzner_list_storage_boxes` | Lists all Storage Boxes (auto-paginates) | |
| `hetzner_get_storage_box` | Gets details of one Storage Box | |
| `hetzner_create_storage_box` | Creates a new Storage Box (costs money!) | |
| `hetzner_update_storage_box` | Updates name or labels | |
| `hetzner_delete_storage_box` | Permanently deletes a Storage Box | ⚠️ |
| `hetzner_change_storage_box_type` | Upgrades or downgrades the Storage Box plan | ⚠️ |
| `hetzner_change_storage_box_protection` | Enables/disables delete protection | |
| `hetzner_reset_storage_box_password` | Resets the Storage Box password | ⚠️ |
| `hetzner_update_storage_box_access_settings` | Configures SSH / Samba / WebDAV / ZFS / external access | |

#### Folders
| Tool | What it does |
|------|--------------|
| `hetzner_list_storage_box_folders` | Lists folders inside a Storage Box |

#### Subaccounts
| Tool | What it does | Destructive? |
|------|--------------|:---:|
| `hetzner_list_storage_box_subaccounts` | Lists subaccounts (auto-paginates) | |
| `hetzner_create_storage_box_subaccount` | Creates a subaccount with scoped access | |
| `hetzner_update_storage_box_subaccount` | Updates subaccount settings | |
| `hetzner_delete_storage_box_subaccount` | Deletes a subaccount | ⚠️ |

#### Snapshots
| Tool | What it does | Destructive? |
|------|--------------|:---:|
| `hetzner_list_storage_box_snapshots` | Lists snapshots (auto-paginates) | |
| `hetzner_create_storage_box_snapshot` | Triggers an on-demand snapshot | |
| `hetzner_delete_storage_box_snapshot` | Deletes a snapshot | ⚠️ |
| `hetzner_rollback_storage_box_snapshot` | Rolls back to a snapshot — overwrites current data | ⚠️ |
| `hetzner_enable_storage_box_snapshot_plan` | Enables automatic scheduled snapshots | |
| `hetzner_disable_storage_box_snapshot_plan` | Disables automatic scheduled snapshots | |

---

## Example Workflow

Here's how you might use this MCP to deploy a new project:

### 1. Check what's available
```
You: "What server types are available?"
Claude: [Lists server types with CPU, RAM, disk, and pricing]

You: "What locations can I use?"
Claude: [Lists Falkenstein, Nuremberg, Helsinki, etc.]
```

### 2. Add your SSH key (if not already added)
```
You: "Add my SSH key called 'my-laptop'"
Claude: "What's the public key content?"
You: [Paste your ~/.ssh/id_ed25519.pub content]
Claude: "SSH key 'my-laptop' created with ID 12345"
```

### 3. Create a server
```
You: "Create a cx22 server with Ubuntu 24.04 in Falkenstein, name it my-app, and use my SSH key"
Claude: "Server 'my-app' created!
  - ID: 67890
  - IP: 123.45.67.89
  - Status: initializing
  SSH key authentication is configured."
```

### 4. Connect to your server
```bash
ssh root@123.45.67.89
```

### 5. Check RAM usage
```
You: "How much RAM is my-app using?"
Claude: [SSHes in, runs free -m, returns used/total/available]
```

### 6. When done, delete the server (to stop charges)
```
You: "Delete server my-app"
Claude: "Are you sure? This is permanent."
You: "Yes, delete it"
Claude: "Server 67890 is being deleted."
```

---

## Troubleshooting

### "HETZNER_API_TOKEN environment variable is required"
You haven't configured the token. Make sure:
1. The token is in your Claude Code MCP config
2. You've restarted Claude Code

### "Error: Authentication failed"
Your API token is invalid. Generate a new one in the Hetzner console.

### "Error: Permission denied"
Your token doesn't have write permissions. Generate a new token with "Read & Write".

### "Error: Resource not found"
The server/SSH key/volume ID doesn't exist. Use the list commands to see what's available.

### Storage Box tools return "401 Unauthorized"
You need a **unified token** from `console.hetzner.com/account/security/api-tokens`, not a Cloud project token. Set it as `HETZNER_API_TOKEN_UNIFIED`.

### `hetzner_get_server_ram` returns a connection error
The tool SSHes directly into the server. Make sure:
1. The server is running and reachable
2. SSH is open on the configured port (default: 22)
3. The configured `ssh_user` has access (default: `root`)

---

## Development

```bash
# Install dependencies
bun install

# Build (compile TypeScript to JavaScript)
bun run build

# Development mode (auto-rebuild on changes)
bun run dev

# Run tests
bun run test

# Lint
bun run lint
```

---

## License

MIT
