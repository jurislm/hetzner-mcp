# Storage Boxes Tools Spec

> See [overview.md](./overview.md) for architecture and naming conventions.

## Purpose

提供 3 個唯讀 MCP tools 查詢 Hetzner Storage Boxes（NAS 儲存服務）：列表（含分頁）、單一詳情、子帳號列表。Storage Boxes 使用不同的 API endpoint（`api.hetzner.com/v1`）與 token（`HETZNER_API_TOKEN_UNIFIED`）。

## Implementation

- **File**: `src/tools/storage-boxes.ts`
- **Register function**: `registerStorageBoxTools(server: McpServer)`
- **API client**: `makeStorageBoxApiRequest<T>()` from `src/api.ts`（Unified API，非 Cloud API）
- **API base**: `https://api.hetzner.com/v1`（不同於 Cloud API 的 `api.hetzner.cloud/v1`）

## Types（src/types.ts，Zod schema）

```typescript
HetznerStorageBoxSchema — id, name, login, product, location, quota_bytes, used_bytes,
                           snapshots_used_bytes, ssh, webdav, samba, zfs,
                           external_reachability, locked, cancelled

HetznerStorageBoxSubaccountSchema — id, username, home_directory, ssh, webdav, samba,
                                     external_reachability, readonly, comment

HetznerMetaSchema — pagination.page, pagination.per_page, pagination.last_page, pagination.total_entries
```

所有 API 回應在 `makeStorageBoxApiRequest` 邊界以 Zod schema 驗證（C-1 規則）。

## Helper Functions（src/tools/storage-boxes.ts，exported for testing）

- `formatBytes(bytes: number): string` — 轉換 bytes 為 GiB/MiB 字串
- `formatStorageBox(box: HetznerStorageBox): string` — 格式化單一 Storage Box 為 Markdown

## Pagination

- Hard cap：`PAGINATION_HARD_CAP_PAGES = 5`（5 頁 × 50 筆 = 最多 250 筆）
- 預設行為：自動逐頁 fetch 直到最後一頁或 cap
- 超過 cap 時輸出截斷警告 `⚠️ Truncated at 5 pages`
- 指定 `page` 參數時改為 single-page 模式

## Response Format

所有 tools 支援 `response_format` 參數：
- `markdown`（預設）— 人類可讀的 Markdown 格式
- `json` — 原始 JSON，方便程式處理

## Tools

### `hetzner_list_storage_boxes`

列出帳號下所有 Storage Boxes（自動分頁，最多 250 筆）。

**Input**:
- `page` (number, optional) — 指定頁碼時改為 single-page 模式
- `per_page` (number, optional, max 50) — 每頁筆數，預設 50
- `response_format` (`'markdown'|'json'`, optional) — 輸出格式，預設 `markdown`

**Output**: 每個 Storage Box 的名稱、ID、login、product、location、使用量、啟用的 protocols

**Behavior**:
- GIVEN token 有效 WHEN 呼叫（無 page 參數）THEN 自動 fetch 所有頁，返回所有 Storage Boxes
- GIVEN 超過 5 頁 WHEN 自動分頁 THEN 截斷並在輸出頂部加入 `⚠️ Truncated at 5 pages` 警告
- GIVEN 指定 `page=2` WHEN 呼叫 THEN 只 fetch 第 2 頁，不繼續翻頁
- GIVEN 無 Storage Box WHEN 呼叫 THEN 返回空列表提示訊息
- GIVEN `HETZNER_API_TOKEN_UNIFIED` 未設定 WHEN 呼叫 THEN fallback 至 `HETZNER_API_TOKEN` 並輸出 WARN log 至 stderr
- GIVEN token 無效 WHEN 呼叫 THEN 返回 401 錯誤，提示檢查 `HETZNER_API_TOKEN_UNIFIED`

---

### `hetzner_get_storage_box`

取得單一 Storage Box 的完整詳情。

**Input**:
- `id` (number, required) — Storage Box ID
- `response_format` (`'markdown'|'json'`, optional) — 輸出格式，預設 `markdown`

**Output**: Storage Box 完整資訊（容量、使用量、protocols、reachability、locked/cancelled 狀態）

**Behavior**:
- GIVEN 有效的 id WHEN 呼叫 THEN 返回該 Storage Box 詳情
- GIVEN 不存在的 id WHEN 呼叫 THEN 返回 404 錯誤訊息
- GIVEN `response_format=json` WHEN 呼叫 THEN 返回原始 JSON 物件

---

### `hetzner_list_storage_box_subaccounts`

列出指定 Storage Box 的所有子帳號（自動分頁，最多 250 筆）。

**Input**:
- `id` (number, required) — Storage Box ID
- `page` (number, optional) — 指定頁碼時改為 single-page 模式
- `per_page` (number, optional, max 50) — 每頁筆數，預設 50
- `response_format` (`'markdown'|'json'`, optional) — 輸出格式，預設 `markdown`

**Output**: 每個子帳號的 username、home_directory、啟用的 protocols（SSH/WebDAV/Samba）、readonly 狀態

**Behavior**:
- GIVEN 有效的 id WHEN 呼叫（無 page 參數）THEN 返回所有子帳號（自動分頁）
- GIVEN 不存在的 id WHEN 呼叫 THEN 返回 404 錯誤訊息
- GIVEN 無子帳號 WHEN 呼叫 THEN 返回空列表提示訊息

## Error Handling

- API 呼叫失敗 → `catch(error)` → `handleApiError(error)` → `{ isError: true, content: [...] }`
- 401：`"Error: Authentication failed. Please check your HETZNER_API_TOKEN (or HETZNER_API_TOKEN_UNIFIED for Storage Box endpoints)."`
- Zod 驗證失敗（API schema 不符）→ ZodError，透過 `handleApiError` 轉為 `"Error: Unexpected API response format"` 訊息
- Partial failure（分頁過程中途失敗）→ 返回已取得的資料，並附加 `⚠️ Partial failure` 警告

## Key Differences from Other Tools

| 項目 | Cloud tools（servers/ssh-keys/reference） | Storage Box tools |
|---|---|---|
| API base | `https://api.hetzner.cloud/v1` | `https://api.hetzner.com/v1` |
| Token | `HETZNER_API_TOKEN` | `HETZNER_API_TOKEN_UNIFIED`（fallback: `HETZNER_API_TOKEN`） |
| Client function | `makeApiRequest<T>()` | `makeStorageBoxApiRequest<T>()` |
| Schema validation | Zod（C-2） | Zod（C-1） |
| Pagination | 無 | 自動多頁，hard cap 5 頁 |
| Output format | 固定 Markdown | `response_format` 參數控制 |
