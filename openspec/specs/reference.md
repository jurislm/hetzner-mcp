# Reference Tools Spec

> See [overview.md](./overview.md) for architecture and naming conventions.

## Purpose

提供 3 個唯讀 MCP tools 查詢 Hetzner Cloud 的可用選項：伺服器規格、OS 映像、資料中心位置。這些 tools 主要作為 `hetzner_create_server` 的前置查詢步驟。

## Implementation

- **File**: `src/tools/reference.ts`
- **Register function**: `registerReferenceTools(server: McpServer)`
- **API client**: `makeApiRequest<T>()` from `src/api.ts`

## Types（src/types.ts）

```typescript
interface HetznerServerType {
  id: number
  name: string        // e.g. "cx22", "cpx11"
  description: string
  cores: number
  memory: number      // GB
  disk: number        // GB
  prices: Array<{ location: string; price_monthly: { gross: string } }>
}

interface HetznerImage {
  id: number
  name: string        // e.g. "ubuntu-24.04"
  description: string
  os_flavor: string
  os_version: string
  status: string
}

interface HetznerLocation {
  id: number
  name: string        // e.g. "fsn1", "nbg1", "hel1"
  description: string
  country: string
  city: string
}
```

## Tools

### `hetzner_list_server_types`

列出所有可用伺服器規格及定價。

**Input**: 無必填參數

**Output**: 每種規格的名稱、CPU 核心數、記憶體（GB）、磁碟（GB）、月費（EUR，含稅）

**Behavior**:
- GIVEN API token 有效 WHEN 呼叫 THEN 返回所有可用規格列表（含定價）
- GIVEN API token 無效 WHEN 呼叫 THEN 返回 401 錯誤訊息

**注意**: 此 tool 結果用於 `hetzner_create_server` 的 `server_type` 參數選擇。

---

### `hetzner_list_images`

列出所有可用 OS 映像檔。

**Input**: 無必填參數（可選 `type` 過濾：`system`、`snapshot`、`backup`）

**Output**: 每個映像的名稱、描述、OS 類型、版本、狀態

**Behavior**:
- GIVEN API token 有效 WHEN 呼叫 THEN 返回可用映像列表
- GIVEN API token 無效 WHEN 呼叫 THEN 返回 401 錯誤訊息

**注意**: 此 tool 結果用於 `hetzner_create_server` 的 `image` 參數選擇。

---

### `hetzner_list_locations`

列出所有可用資料中心位置。

**Input**: 無必填參數

**Output**: 每個位置的名稱（代碼）、描述、國家、城市

**常見位置代碼**:
- `fsn1` — Falkenstein, Germany
- `nbg1` — Nuremberg, Germany
- `hel1` — Helsinki, Finland
- `ash` — Ashburn, Virginia, USA
- `hil` — Hillsboro, Oregon, USA
- `sin` — Singapore

**Behavior**:
- GIVEN API token 有效 WHEN 呼叫 THEN 返回所有可用資料中心列表
- GIVEN API token 無效 WHEN 呼叫 THEN 返回 401 錯誤訊息

**注意**: 此 tool 結果用於 `hetzner_create_server` 的 `location` 參數選擇。

## Error Handling

與 servers.ts 相同模式：所有 API 呼叫 catch → `handleApiError(error)` → `{ isError: true, content: [...] }`
