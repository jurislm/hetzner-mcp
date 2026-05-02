# Servers Tools Spec

> See [overview.md](./overview.md) for architecture and naming conventions.

## Purpose

提供 7 個 MCP tools 管理 Hetzner Cloud 伺服器的生命週期：列表、查詢、建立、刪除、電源控制。

## Implementation

- **File**: `src/tools/servers.ts`
- **Register function**: `registerServerTools(server: McpServer)`
- **API client**: `makeApiRequest<T>()` from `src/api.ts`

## Tools

### `hetzner_list_servers`

列出目前專案下所有伺服器。

**Input**: 無必填參數

**Output**: 每台伺服器的 ID、名稱、狀態、IPv4、server type、資料中心位置

**Behavior**:
- GIVEN Hetzner API token 有效 WHEN 呼叫此 tool THEN 返回伺服器列表（可為空陣列）
- GIVEN 無伺服器 WHEN 呼叫此 tool THEN 返回提示文字 `"No servers found. Use hetzner_create_server to create one."`
- GIVEN API token 無效 WHEN 呼叫此 tool THEN 返回 `handleApiError()` 輸出（含 401 提示）

---

### `hetzner_get_server`

取得單一伺服器詳情。

**Input**: `server_id` (number, required)

**Output**: 完整伺服器資訊（IP、狀態、規格、資料中心、建立時間）

**Behavior**:
- GIVEN 有效 server_id WHEN 呼叫 THEN 返回對應伺服器詳情
- GIVEN 不存在的 server_id WHEN 呼叫 THEN 返回 404 錯誤訊息

---

### `hetzner_create_server`

建立新伺服器（**會產生費用**）。

**Input**:
- `name` (string, required) — 伺服器名稱
- `server_type` (string, required) — 規格代碼（例：`cx22`），用 `hetzner_list_server_types` 查詢
- `image` (string, required) — OS 映像（例：`ubuntu-24.04`），用 `hetzner_list_images` 查詢
- `location` (string, optional) — 資料中心（例：`fsn1`），用 `hetzner_list_locations` 查詢
- `ssh_keys` (string[], optional) — 要注入的 SSH key 名稱或 ID 陣列

**Output**: 新伺服器 ID、IP、狀態，以及 root 密碼（若未指定 SSH key）

**Behavior**:
- GIVEN 有效參數 WHEN 呼叫 THEN 返回新伺服器資訊，狀態為 `initializing`
- GIVEN 已存在相同名稱 WHEN 呼叫 THEN 返回 422 衝突錯誤訊息
- GIVEN 無效 server_type WHEN 呼叫 THEN 返回 422 錯誤訊息

---

### `hetzner_delete_server`

永久刪除伺服器（不可逆）。

**Input**: `server_id` (number, required)

**Output**: 操作結果確認訊息

**Behavior**:
- GIVEN 有效 server_id WHEN 呼叫 THEN 伺服器被刪除，返回成功訊息
- GIVEN 不存在的 server_id WHEN 呼叫 THEN 返回 404 錯誤訊息

---

### `hetzner_power_on_server`

啟動已停止的伺服器。

**Input**: `server_id` (number, required)

**Output**: action 物件（id、status、progress）

**Behavior**:
- GIVEN 伺服器狀態為 `off` WHEN 呼叫 THEN 返回 action 資訊，伺服器開始啟動
- GIVEN 伺服器已在 `running` WHEN 呼叫 THEN Hetzner API 返回錯誤，透過 `handleApiError()` 回傳

---

### `hetzner_power_off_server`

強制關機（等同拔電源，資料可能遺失）。

**Input**: `server_id` (number, required)

**Output**: action 物件

**Behavior**:
- GIVEN 伺服器狀態為 `running` WHEN 呼叫 THEN 返回 action 資訊，強制關機
- GIVEN 不存在的 server_id WHEN 呼叫 THEN 返回 404 錯誤訊息

---

### `hetzner_reboot_server`

強制重新開機。

**Input**: `server_id` (number, required)

**Output**: action 物件

**Behavior**:
- GIVEN 伺服器狀態為 `running` WHEN 呼叫 THEN 返回 action 資訊，重開機開始執行
- GIVEN 不存在的 server_id WHEN 呼叫 THEN 返回 404 錯誤訊息

## Error Handling

所有工具統一：
- API 呼叫失敗 → `catch(error)` → `handleApiError(error)` → `{ isError: true, content: [{ type: "text", text: "..." }] }`
- 401：`"Error: Authentication failed. Please check your HETZNER_API_TOKEN."`
- 404：Hetzner API 錯誤訊息直接轉發
