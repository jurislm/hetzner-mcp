## Context

系統性比對 20 個 MCP tools 與官方 API 後，發現以下現況：

- `hetzner_list_servers`：`ListServersResponseSchema` 無 `meta`，handler 無 `page`/`per_page` 參數；伺服器 > 25 台時回傳第一頁並靜默截斷
- `hetzner_list_ssh_keys`：同上，SSH key > 25 把時截斷
- `hetzner_list_storage_boxes`：已有分頁，但缺少 `label_selector`/`name` 篩選（API 支援）
- `hetzner_list_storage_box_subaccounts`：缺少 `username` 篩選（changelog 確認支援）；subaccount 物件欄位名稱（`ssh`, `webdav`, `samba` 平坦 booleans）無法從 Context7 取得明確 unified API schema，需 live 驗證

## Goals / Non-Goals

**Goals:**
- 修正 servers / ssh-keys 的靜默截斷問題，加入自動分頁（與 storage-boxes 行為一致）
- 在 storage-boxes 的 list tools 加入篩選參數
- 驗證並（必要時）修正 subaccount schema 欄位名稱

**Non-Goals:**
- 新增任何目前未實作的 Storage Box actions
- 修改非列表類工具的行為
- 改變現有工具的回傳格式

## Decisions

### D-1：抽取通用 `cloudPaginatedFetch`

Storage boxes 的 `paginatedFetch` 與 `makeStorageBoxApiRequest` 緊耦合。為 servers / ssh-keys 加入分頁，**不複製 paginatedFetch 邏輯**，而是將其重構為接受 requestFn 的泛型函數。

**方案 A（選擇）**：在 `src/api.ts` 新增 `createPaginatedFetch(requestFn)` factory，storage-boxes.ts 改用此 factory，servers.ts / ssh-keys.ts 用同一 factory 但傳入 `makeApiRequest`。

**方案 B（棄用）**：在每個 tools 檔案各自實作分頁。缺點：邏輯重複，hard cap / partialFailure 行為可能歧異。

**方案 C（棄用）**：只加 `page`/`per_page` 單頁模式，不自動翻頁。缺點：仍需使用者手動翻頁，無法解決靜默截斷的根本問題。

### D-2：servers / ssh-keys 分頁 hard cap

與 storage-boxes 保持一致：`PAGINATION_HARD_CAP_PAGES = 5`（5 × 25 = 125 台伺服器）。超過 cap 輸出截斷警告，不報 error。Cloud API 預設 per_page = 25（非 50），需在 handler 中使用正確預設值。

### D-3：subaccount schema 驗證策略

Context7 未返回明確的 subaccount object schema。現有欄位（`ssh`, `webdav`, `samba` 平坦 booleans）自功能上線以來未報 ZodError，推測與 unified API 一致。

**策略**：先以 live API 呼叫驗證（Box ID: 561406 或 sandbox token），若欄位一致則不動 schema；若不一致則在同一 PR 修正欄位名稱並更新 `formatSubaccount`。

## Risks / Trade-offs

- **schema 重構風險（D-1）**：`paginatedFetch` 目前有完整測試覆蓋。重構時需確保既有測試繼續通過，不能破壞 storage-boxes 行為。→ Mitigation：重構後跑全套測試，確保 116 tests 通過。
- **subaccount schema 不一致風險**：若 unified API 實際使用不同欄位名（如 `access_settings.ssh_enabled`），live 驗證後才能修正，會增加 PR scope。→ Mitigation：先在 task 中列為第一步（阻塞其他 task），早期發現。
- **Cloud API pagination format**：Cloud API (`api.hetzner.cloud/v1`) 的 meta 結構與 Unified API (`api.hetzner.com/v1`) 可能略有不同（per_page 預設值）。→ Mitigation：在 schema 中將非關鍵欄位標為 optional，僅消費 `next_page`。

## Migration Plan

所有變更均為加法（新增參數 / schema 欄位），無破壞性改動：
- `page`/`per_page` 為 optional，預設行為改為自動分頁（此為行為變更，但修正的是 bug，不是 feature）
- 若 subaccount 欄位更名屬 schema 修正（bug fix），不算 breaking change

## Open Questions

- **OQ-1**：subaccount unified API 的實際欄位名稱？需 live 驗證後才能確定。若不一致則 `HetznerStorageBoxSubaccountSchema` 和 `formatSubaccount` 需同步更新。
