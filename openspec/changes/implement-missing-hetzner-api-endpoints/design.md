## Context

MCP server 目前對 Storage Box 的覆蓋率為讀取 + snapshot 管理，缺少完整的寫入能力。所有 14 個缺口均為 Unified API（`https://api.hetzner.com/v1`），需使用 `makeStorageBoxApiRequest`。現有 `storage-boxes.ts` 已有成熟的模式（`makeStorageBoxApiRequest`、`handleApiError`、`formatStorageBox`），新工具直接沿用。

## Goals / Non-Goals

**Goals:**
- 實作全部 14 個缺口端點，使覆蓋率達到 100%（Storage Box 分類）
- 每個新工具有對應 Vitest 測試
- 破壞性操作（DELETE、rollback-like actions）標記 `destructiveHint: true`

**Non-Goals:**
- 修改已有工具行為
- 實作 Servers / SSH Keys 以外的其他 API 分類（已 100%）
- 實作 WebDAV / FTP 檔案存取層

## Decisions

### D-1：所有新工具統一使用 `makeStorageBoxApiRequest`

所有 Storage Box 端點均位於 Unified API，與現有 6 個工具一致。無需新增 API client function。

### D-2：Response schema 策略

| 端點類型 | Response schema |
|----------|----------------|
| POST /storage_boxes | `z.object({ storage_box: HetznerStorageBoxSchema })` — 重用現有 schema |
| PUT /storage_boxes/{id} | 同上 |
| DELETE /storage_boxes/{id} | `StorageBoxActionResponseSchema`（`{ action: HetznerActionSchema }`） |
| GET /storage_boxes/{id}/folders | 新增 `HetznerFolderSchema` + `ListFoldersResponseSchema` |
| POST /storage_boxes/{id}/subaccounts | `z.object({ subaccount: HetznerStorageBoxSubaccountSchema })` — 重用現有 schema |
| PUT /storage_boxes/{id}/subaccounts/{username} | 同上 |
| DELETE /storage_boxes/{id}/subaccounts/{username} | `StorageBoxActionResponseSchema` |
| DELETE /storage_boxes/{id}/snapshots/{id} | `StorageBoxActionResponseSchema` |
| POST /storage_boxes/{id}/actions/* | `StorageBoxActionResponseSchema` |

`HetznerActionSchema` 已在 `src/types.ts` 定義（`StorageBoxSnapshotActionResponseSchema` 已使用）；抽出為共用的 `StorageBoxActionResponseSchema`。

### D-3：request body 結構（基於官方文件）

```typescript
// create storage box
{ storage_box_type: string; location: string; name?: string; labels?: Record<string,string>; autodelete?: boolean }

// update storage box
{ name?: string; labels?: Record<string,string>; autodelete?: boolean }

// create subaccount
{ comment?: string; labels?: Record<string,string>; access_settings?: SubaccountAccessSettings }

// update subaccount
{ comment?: string; labels?: Record<string,string>; access_settings?: SubaccountAccessSettings }

// SubaccountAccessSettings
{ ssh_enabled?: boolean; samba_enabled?: boolean; webdav_enabled?: boolean; zfs_enabled?: boolean; reachable_externally?: boolean; readonly?: boolean }

// change_protection
{ delete: boolean }

// change_type
{ storage_box_type: string }

// reset_password（無 body，API 自動生成密碼並回傳）
{}

// update_access_settings
{ ssh_enabled?: boolean; samba_enabled?: boolean; webdav_enabled?: boolean; zfs_enabled?: boolean; reachable_externally?: boolean }

// enable_snapshot_plan
{ minute: number; hour: number; day_of_week: number | null; day_of_month: number | null }

// disable_snapshot_plan
{}
```

### D-4：`reset_password` 回傳密碼處理

API 回傳 `{ action: {...}, password: string }`。response schema 擴充 action 欄位，密碼在 markdown 模式下顯示並附警告「儲存後不再顯示」。

### D-5：測試 mock 模式

沿用現有模式：`vi.mock("../../src/api.js", async (importOriginal) => ({ ...actual, makeStorageBoxApiRequest: vi.fn() }))`。每個新工具至少測試：success（markdown）、success（json）、API error（isError: true）。破壞性工具額外測試確認訊息格式。

## Risks / Trade-offs

- **`create_storage_box` 產生費用風險**：`destructiveHint: false`（非破壞）但 `annotations` 加入費用警告說明。→ Mitigation：tool description 明確標注「**會產生費用**」。
- **`reset_password` 密碼曝露**：密碼出現在 MCP response 中，claude.ai 對話記錄可能留存。→ Mitigation：description 與 markdown output 均加入「請立即更換密碼」提示。
- **`change_type` 升降級中斷服務**：降級可能導致資料超出容量上限。→ Mitigation：description 加入警告，`destructiveHint: true`。
- **`GET /folders` schema 不確定性**：官方文件對 folder 物件欄位描述有限。→ Mitigation：使用 `.passthrough()` 接受額外欄位，Open Question 列出需 live 驗證。

## Migration Plan

純加法：新增 types + 新增工具，不修改現有工具。無資料遷移。

## Open Questions

- **OQ-1**：`GET /storage_boxes/{id}/folders` 回傳的 folder 物件確切欄位？需 live API 驗證或 Context7 查詢後確認 `HetznerFolderSchema`。
- **OQ-2**：`reset_password` response 是否只有 `action` 還是 `action + password`？需驗證。
- **OQ-3**：`DELETE /storage_boxes/{id}/subaccounts/{username}` 回傳 204 No Content 還是 action 物件？
