# CLAUDE.md — JurisLM Hetzner MCP Server

Hetzner Cloud 管理 MCP Server，提供 17 個工具用於伺服器管理（建立、電源控制、SSH 金鑰、Storage Boxes）。

## 常用命令

```bash
bun install          # 安裝依賴
bun run build        # 編譯 TypeScript 到 dist/
bun run dev          # 開發模式（bun --watch，stdio transport）
bun run lint         # ESLint 檢查（max-warnings=0）
bun run test         # Vitest 單元測試（一次執行）
bun run test:watch   # Vitest 監看模式

# 本地執行
HETZNER_API_TOKEN="token" bun dist/index.js
```

## Git 分支規範

```
develop → PR → main
```

- 日常開發一律在 `.worktrees/develop` 目錄，不在 main worktree 做 feature commits
- **嚴禁直接 push 到 main**
- 版本號由 Release Please 自動管理，**禁止手動修改 `package.json` 版本號**

## 架構

```
src/
├── index.ts           # MCP server 入口，載入所有 tools
├── api.ts             # Hetzner Cloud API client（axios）
├── types.ts           # TypeScript 型別定義
└── tools/
    ├── servers.ts     # 7 個伺服器管理工具
    ├── ssh-keys.ts    # 4 個 SSH 金鑰工具
    ├── reference.ts   # 3 個參考資料工具
    └── storage-boxes.ts # 3 個 Storage Boxes 工具
```

## 工具清單（17 個）

### Servers（7 tools）
- `hetzner_list_servers` — 列出專案所有伺服器
- `hetzner_get_server` — 取得單一伺服器詳情（IP、狀態、規格）
- `hetzner_create_server` — 建立新伺服器（**會產生費用**）
- `hetzner_delete_server` — 永久刪除伺服器
- `hetzner_power_on_server` — 啟動已停止的伺服器
- `hetzner_power_off_server` — 強制關機
- `hetzner_reboot_server` — 強制重新開機

### SSH Keys（4 tools）
- `hetzner_list_ssh_keys` — 列出所有 SSH 金鑰
- `hetzner_get_ssh_key` — 取得單一 SSH 金鑰詳情
- `hetzner_create_ssh_key` — 新增 SSH 公鑰
- `hetzner_delete_ssh_key` — 刪除 SSH 金鑰

### Reference（3 tools）
- `hetzner_list_server_types` — 列出可用伺服器規格與定價
- `hetzner_list_images` — 列出可用 OS 映像檔
- `hetzner_list_locations` — 列出可用資料中心位置

### Storage Boxes（3 tools）
- `hetzner_list_storage_boxes` — 列出所有 Storage Box（支援分頁）
- `hetzner_get_storage_box` — 取得單一 Storage Box 詳情（容量、protocols、狀態）
- `hetzner_list_storage_box_subaccounts` — 列出 Storage Box 的所有子帳號

## 環境變數

| 變數 | 必需 | 說明 |
|------|------|------|
| `HETZNER_API_TOKEN` | ✓ | Read & Write token，從 Hetzner Cloud Console 生成 |

**注意**：MCP Server 是非互動式子進程，環境變數必須寫入 `~/.zshenv`（非 `~/.zshrc`）。

## 新增工具流程

1. `src/types.ts` — 新增 TypeScript 介面
2. `src/api.ts` — 新增 API client 方法
3. `src/tools/<category>.ts` — 新增 MCP tool 定義（`server.tool()`）
4. `src/index.ts` — 若新建 tools 檔案需 import

工具命名規則：`hetzner_` 前綴 + `snake_case`（例：`hetzner_resize_server`）

## GitHub Actions

| Workflow | 觸發條件 | 用途 |
|----------|---------|------|
| `claude-code-review.yml` | PR 開啟／更新 | Claude Bot 自動 Code Review，繁體中文格式 |
| `claude.yml` | `@claude` mention | 在 issue / PR 評論中觸發 Claude Code 執行任務 |
| `release.yml` | push to main | Release Please 自動建立版本 PR |

## 版本發布

1. PR `develop` → `main` merge
2. Release Please 自動建立版本 PR
3. 合併版本 PR 後，**手動執行** `bun publish --access public`
