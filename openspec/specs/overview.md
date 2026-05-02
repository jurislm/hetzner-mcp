# Hetzner MCP Server — Overview Spec

## Purpose

Hetzner Cloud 管理 MCP Server，透過 stdio transport 提供 14 個 MCP tools，讓 AI agent 能管理 Hetzner Cloud 基礎設施。

## Architecture

```
src/
├── index.ts           # McpServer 初始化、HETZNER_API_TOKEN 驗證、stdio transport 啟動
├── api.ts             # makeApiRequest<T>()、handleApiError()、getApiClient()
├── types.ts           # HetznerServer、HetznerSSHKey、HetznerServerType 等介面
└── tools/
    ├── servers.ts     # 7 tools — registerServerTools(server)
    ├── ssh-keys.ts    # 4 tools — registerSSHKeyTools(server)
    └── reference.ts   # 3 tools — registerReferenceTools(server)
```

## Tool Inventory（14 tools）

| Category | Tools | Spec |
|---|---|---|
| Servers | 7 | [servers.md](./servers.md) |
| SSH Keys | 4 | [ssh-keys.md](./ssh-keys.md) |
| Reference | 3 | [reference.md](./reference.md) |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `HETZNER_API_TOKEN` | ✓ | Hetzner Cloud API token（Read & Write），從 console.hetzner.cloud 生成 |

MCP Server 為非互動式子進程，`HETZNER_API_TOKEN` 必須寫入 `~/.zshenv`。

## Naming Conventions

- Tool ID：`hetzner_` 前綴 + `snake_case`（例：`hetzner_create_server`）
- Register function：`register<Category>Tools(server: McpServer)`
- Error handling：所有 API 呼叫透過 `handleApiError()` 統一轉換錯誤訊息

## Transport

stdio（標準輸入/輸出）。stdout 保留給 MCP 協定，log 一律寫 stderr。
