## Why

系統性比對 20 個 MCP tools 與 Hetzner 官方 API（docs.hetzner.cloud，Context7 核實）後，發現 4 個覆蓋缺口：`hetzner_list_servers` / `hetzner_list_ssh_keys` 無分頁支援（結果超過 25 筆時靜默截斷）、`hetzner_list_storage_boxes` 缺少 `label_selector`/`name` 篩選參數、`HetznerStorageBoxSubaccountSchema` 欄位名稱尚未從 Robot API 格式更新為 Unified API 格式。

## What Changes

- `hetzner_list_servers`：加入分頁支援（`page`、`per_page` 參數）；`ListServersResponseSchema` 加入 `meta` 欄位；結果超過單頁上限時加入截斷警告
- `hetzner_list_ssh_keys`：加入分頁支援（`page`、`per_page` 參數）；`ListSSHKeysResponseSchema` 加入 `meta` 欄位；結果超過單頁上限時加入截斷警告
- `hetzner_list_storage_boxes`：inputSchema 新增 `label_selector`（string, optional）與 `name`（string, optional）篩選參數，轉發至 API query params
- `HetznerStorageBoxSubaccountSchema`：透過 Context7 核實 Unified API `/storage_boxes/{id}/subaccounts` 實際回傳欄位，必要時更新欄位名稱以符合 Unified API（目前欄位疑為 Robot API 格式）

## Capabilities

### New Capabilities

（無，均為現有 capability 的行為修正）

### Modified Capabilities

- `servers`：`hetzner_list_servers` 新增分頁行為（`page`/`per_page` 輸入、截斷警告輸出）
- `ssh-keys`：`hetzner_list_ssh_keys` 新增分頁行為（`page`/`per_page` 輸入、截斷警告輸出）
- `storage-boxes`：`hetzner_list_storage_boxes` 新增篩選行為；subaccount schema 欄位對齊 Unified API

## Impact

- **`src/types.ts`**：`ListServersResponseSchema`、`ListSSHKeysResponseSchema` 加入 `meta`；`HetznerStorageBoxSubaccountSchema` 欄位可能更名
- **`src/tools/servers.ts`**：`hetzner_list_servers` inputSchema、handler 加入分頁邏輯
- **`src/tools/ssh-keys.ts`**：`hetzner_list_ssh_keys` inputSchema、handler 加入分頁邏輯
- **`src/tools/storage-boxes.ts`**：`hetzner_list_storage_boxes` inputSchema 加入篩選參數；若 subaccount schema 更名則 `formatSubaccount` 需同步更新
- **`tests/`**：servers、ssh-keys、storage-boxes 測試需補齊分頁 / 篩選 / schema 覆蓋
- **`docs/hetzner-api-reference.md`**：更新實作覆蓋率表格
