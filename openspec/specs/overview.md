# Hetzner MCP Server — Overview Spec

## Purpose

Hetzner Cloud 管理 MCP Server，透過 stdio transport 提供 17 個 MCP tools，讓 AI agent 能管理 Hetzner Cloud 基礎設施（伺服器、SSH 金鑰、Storage Boxes）。

## Architecture

```
src/
├── index.ts           # McpServer 初始化、HETZNER_API_TOKEN 驗證、stdio transport 啟動
├── api.ts             # makeApiRequest<T>()、makeStorageBoxApiRequest<T>()、handleApiError()
├── types.ts           # HetznerServer、HetznerSSHKey、HetznerStorageBox 等介面（Zod schema）
└── tools/
    ├── servers.ts       # 7 tools — registerServerTools(server)
    ├── ssh-keys.ts      # 4 tools — registerSSHKeyTools(server)
    ├── reference.ts     # 3 tools — registerReferenceTools(server)
    └── storage-boxes.ts # 3 tools — registerStorageBoxTools(server)
```

## Tool Inventory（17 tools）

| Category | Tools | Spec |
|---|---|---|
| Servers | 7 | [servers.md](./servers.md) |
| SSH Keys | 4 | [ssh-keys.md](./ssh-keys.md) |
| Reference | 3 | [reference.md](./reference.md) |
| Storage Boxes | 3 | [storage-boxes.md](./storage-boxes.md) |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HETZNER_API_TOKEN` | ✓ | Cloud API token（Read & Write），從 console.hetzner.cloud 生成 |
| `HETZNER_API_TOKEN_UNIFIED` | 建議 | Unified API token，Storage Box 端點（`api.hetzner.com/v1`）需要此 token；未設定時 fallback 至 `HETZNER_API_TOKEN`，但 Cloud project token 通常無法驗證 Unified API |

MCP Server 為非互動式子進程，兩個 token 均必須寫入 `~/.zshenv`（非 `~/.zshrc`）。

## Naming Conventions

- Tool ID：`hetzner_` 前綴 + `snake_case`（例：`hetzner_create_server`）
- Register function：`register<Category>Tools(server: McpServer)`
- Error handling：所有 API 呼叫透過 `handleApiError()` 統一轉換錯誤訊息

## Transport

stdio（標準輸入/輸出）。stdout 保留給 MCP 協定，log 一律寫 stderr。
