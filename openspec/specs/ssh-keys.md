# SSH Keys Tools Spec

> See [overview.md](./overview.md) for architecture and naming conventions.

## Purpose

提供 4 個 MCP tools 管理 Hetzner Cloud 帳號下的 SSH 公鑰：列表、查詢、新增、刪除。SSH key 可在建立伺服器時注入（透過 `hetzner_create_server` 的 `ssh_keys` 參數）。

## Implementation

- **File**: `src/tools/ssh-keys.ts`
- **Register function**: `registerSSHKeyTools(server: McpServer)`
- **API client**: `makeApiRequest<T>()` from `src/api.ts`

## Types（src/types.ts）

```typescript
interface HetznerSSHKey {
  id: number
  name: string
  fingerprint: string
  public_key: string
  labels: Record<string, string>
  created: string
}
```

## Tools

### `hetzner_list_ssh_keys`

列出帳號下所有 SSH 金鑰。

**Input**: 無必填參數

**Output**: SSH key 列表，每筆含 ID、名稱、fingerprint、建立時間

**Behavior**:
- GIVEN API token 有效 WHEN 呼叫 THEN 返回所有 SSH key 列表（可為空陣列）
- GIVEN 無 SSH key WHEN 呼叫 THEN 返回提示文字 `"No SSH keys found. Use hetzner_create_ssh_key to add one."`
- GIVEN API token 無效 WHEN 呼叫 THEN 返回 401 錯誤訊息

---

### `hetzner_get_ssh_key`

取得單一 SSH 金鑰詳情。

**Input**: `ssh_key_id` (number, required)

**Output**: 完整 SSH key 資訊（含 public_key 全文、fingerprint）

**Behavior**:
- GIVEN 有效 ssh_key_id WHEN 呼叫 THEN 返回對應 SSH key 詳情
- GIVEN 不存在的 ssh_key_id WHEN 呼叫 THEN 返回 404 錯誤訊息

---

### `hetzner_create_ssh_key`

新增 SSH 公鑰到 Hetzner 帳號。

**Input**:
- `name` (string, required) — 金鑰名稱（唯一）
- `public_key` (string, required) — SSH 公鑰內容（以 `ssh-rsa`、`ssh-ed25519` 等開頭）

**Output**: 新建 SSH key 的 ID、名稱、fingerprint

**Behavior**:
- GIVEN 有效的公鑰格式 WHEN 呼叫 THEN 返回新建 SSH key 詳情
- GIVEN 已存在相同 fingerprint 的公鑰 WHEN 呼叫 THEN 返回 422 衝突錯誤訊息
- GIVEN 無效公鑰格式 WHEN 呼叫 THEN 返回 422 錯誤訊息

---

### `hetzner_delete_ssh_key`

刪除 SSH 金鑰（不影響已使用此 key 的運行中伺服器）。

**Input**: `ssh_key_id` (number, required)

**Output**: 操作結果確認訊息

**Behavior**:
- GIVEN 有效 ssh_key_id WHEN 呼叫 THEN SSH key 被刪除，返回成功訊息
- GIVEN 不存在的 ssh_key_id WHEN 呼叫 THEN 返回 404 錯誤訊息

## Error Handling

與 servers.ts 相同模式：所有 API 呼叫 catch → `handleApiError(error)` → `{ isError: true, content: [...] }`
