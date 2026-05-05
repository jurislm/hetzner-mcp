# Hetzner Unified API Reference

Source: docs.hetzner.cloud (verified via Context7, 2026-05-05)  
Base URL: `https://api.hetzner.com/v1`  
Auth: `Authorization: Bearer <HETZNER_API_TOKEN>`

---

## Storage Boxes

### Core Endpoints

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `GET` | `/storage_boxes` | 列出所有 Storage Boxes（支援分頁、排序、label 篩選） | `hetzner_list_storage_boxes` ✅ 含 `label_selector`/`name` 篩選 |
| `GET` | `/storage_boxes/{id}` | 取得單一 Storage Box 詳情 | `hetzner_get_storage_box` ✅ |
| `POST` | `/storage_boxes` | 建立新 Storage Box | ❌ 未實作 |
| `PUT` | `/storage_boxes/{id}` | 更新 Storage Box（重新命名等） | ❌ 未實作 |
| `DELETE` | `/storage_boxes/{id}` | 刪除 Storage Box | ❌ 未實作 |
| `GET` | `/storage_boxes/{id}/folders` | 列出 Storage Box 內的資料夾 | ❌ 未實作 |

### Storage Box Object Schema

```json
{
  "id": 42,
  "name": "string",
  "username": "u12345",
  "status": "active",
  "server": "u1337.your-storagebox.de",
  "system": "FSN1-BX355",
  "created": "2016-01-30T23:55:00Z",
  "labels": { "environment": "prod" },
  "storage_box_type": {
    "id": 42,
    "name": "bx11",
    "description": "BX11",
    "size": 1073741824,
    "snapshot_limit": 10,
    "automatic_snapshot_limit": 10,
    "subaccounts_limit": 200,
    "prices": [
      {
        "location": "fsn1",
        "price_hourly": { "net": "1.0000", "gross": "1.1900" },
        "price_monthly": { "net": "1.0000", "gross": "1.1900" },
        "setup_fee": { "net": "1.0000", "gross": "1.1900" }
      }
    ],
    "deprecation": {
      "unavailable_after": "2023-09-01T00:00:00Z",
      "announced": "2023-06-01T00:00:00Z"
    }
  },
  "location": {
    "id": 42,
    "name": "fsn1",
    "description": "Falkenstein DC Park 1",
    "country": "DE",
    "city": "Falkenstein",
    "latitude": 50.47612,
    "longitude": 12.370071,
    "network_zone": "eu-central"
  },
  "access_settings": {
    "reachable_externally": true,
    "ssh_enabled": true,
    "samba_enabled": true,
    "webdav_enabled": true,
    "zfs_enabled": true
  },
  "stats": {
    "size": 242270339072,
    "size_data": 242270339072,
    "size_snapshots": 0
  },
  "snapshot_plan": {
    "max_snapshots": 10,
    "minute": 30,
    "hour": 3,
    "day_of_week": 7,
    "day_of_month": null
  },
  "protection": {
    "delete": false
  }
}
```

**欄位說明（stats）：**
- `stats.size` — 已用總空間（bytes）
- `stats.size_data` — data 佔用（bytes）
- `stats.size_snapshots` — snapshot 佔用（bytes）
- `storage_box_type.size` — 配置總容量（bytes）

> **Changelog**：Storage Box 在 `initializing` 狀態時，`stats` 曾回傳 `null`；現已改為 `{"size": 0, "size_data": 0, "size_snapshots": 0}`。

---

### Subaccounts

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `GET` | `/storage_boxes/{id}/subaccounts` | 列出子帳號（支援分頁、`username` 篩選） | `hetzner_list_storage_box_subaccounts` ✅ 含 `username` 篩選 |
| `POST` | `/storage_boxes/{id}/subaccounts` | 建立子帳號 | ❌ 未實作 |
| `PUT` | `/storage_boxes/{id}/subaccounts/{username}` | 更新子帳號設定 | ❌ 未實作 |
| `DELETE` | `/storage_boxes/{id}/subaccounts/{username}` | 刪除子帳號 | ❌ 未實作 |

### Snapshots

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `GET` | `/storage_boxes/{id}/snapshots` | 列出 snapshots（支援分頁、排序） | `hetzner_list_storage_box_snapshots` ✅ |
| `POST` | `/storage_boxes/{id}/snapshots` | 觸發即時 snapshot | `hetzner_create_storage_box_snapshot` ✅ |
| `DELETE` | `/storage_boxes/{id}/snapshots/{snapshot_id}` | 刪除指定 snapshot | ❌ 未實作 |

### Actions

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `POST` | `/storage_boxes/{id}/actions/rollback_snapshot` | 回滾至指定 snapshot（`snapshot` 欄位接受名稱或 ID） | `hetzner_rollback_storage_box_snapshot` ✅ |
| `POST` | `/storage_boxes/{id}/actions/change_protection` | 設定刪除保護 | ❌ 未實作 |
| `POST` | `/storage_boxes/{id}/actions/change_type` | 升降級 Storage Box 規格 | ❌ 未實作 |
| `POST` | `/storage_boxes/{id}/actions/reset_password` | 重設密碼 | ❌ 未實作 |
| `POST` | `/storage_boxes/{id}/actions/update_access_settings` | 更新 SSH / Samba / WebDAV / ZFS / 外部連線設定 | ❌ 未實作 |
| `POST` | `/storage_boxes/{id}/actions/enable_snapshot_plan` | 啟用自動 snapshot 計畫 | ❌ 未實作 |
| `POST` | `/storage_boxes/{id}/actions/disable_snapshot_plan` | 停用自動 snapshot 計畫 | ❌ 未實作 |

**Actions Request Bodies：**

```jsonc
// change_protection
{ "delete": true }

// change_type
{ "storage_box_type": "bx11" }

// reset_password
{ "password": "new_password" }

// update_access_settings
{
  "ssh_enabled": false,
  "samba_enabled": false,
  "webdav_enabled": false,
  "zfs_enabled": false,
  "reachable_externally": false
}

// rollback_snapshot（snapshot_id 已棄用，改用 snapshot）
{ "snapshot": "my-snapshot-name-or-id" }

// enable_snapshot_plan
{ "minute": 30, "hour": 3, "day_of_week": 7, "day_of_month": null }

// disable_snapshot_plan
{}
```

**Action Response Schema：**

```json
{
  "action": {
    "id": 123,
    "command": "rollback_snapshot",
    "status": "running",
    "progress": 0,
    "started": "2023-01-01T10:00:00Z",
    "finished": null,
    "resources": [{ "id": 42, "type": "storage_box" }],
    "error": null
  }
}
```

---

## Servers

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `GET` | `/servers` | 列出所有伺服器 | `hetzner_list_servers` ✅ 含分頁（auto + cap 5）|
| `GET` | `/servers/{id}` | 取得單一伺服器詳情 | `hetzner_get_server` ✅ |
| `POST` | `/servers` | 建立新伺服器 | `hetzner_create_server` ✅ |
| `DELETE` | `/servers/{id}` | 刪除伺服器 | `hetzner_delete_server` ✅ |
| `POST` | `/servers/{id}/actions/poweron` | 啟動伺服器 | `hetzner_power_on_server` ✅ |
| `POST` | `/servers/{id}/actions/poweroff` | 強制關機 | `hetzner_power_off_server` ✅ |
| `POST` | `/servers/{id}/actions/reboot` | 強制重新開機 | `hetzner_reboot_server` ✅ |

---

## SSH Keys

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `GET` | `/ssh_keys` | 列出所有 SSH 金鑰 | `hetzner_list_ssh_keys` ✅ 含分頁（auto + cap 5）|
| `GET` | `/ssh_keys/{id}` | 取得單一 SSH 金鑰詳情 | `hetzner_get_ssh_key` ✅ |
| `POST` | `/ssh_keys` | 新增 SSH 公鑰 | `hetzner_create_ssh_key` ✅ |
| `DELETE` | `/ssh_keys/{id}` | 刪除 SSH 金鑰 | `hetzner_delete_ssh_key` ✅ |

---

## Reference Data

| Method | Endpoint | 說明 | 本 MCP 實作 |
|--------|----------|------|------------|
| `GET` | `/server_types` | 列出可用伺服器規格與定價 | `hetzner_list_server_types` ✅ |
| `GET` | `/images` | 列出可用 OS 映像檔 | `hetzner_list_images` ✅ |
| `GET` | `/locations` | 列出可用資料中心位置 | `hetzner_list_locations` ✅ |

---

## 實作覆蓋率摘要

| 分類 | 官方端點數 | 已實作 | 未實作 |
|------|-----------|--------|--------|
| Storage Boxes（核心） | 6 | 2 | 4 |
| Storage Box Subaccounts | 4 | 1 | 3 |
| Storage Box Snapshots | 3 | 2 | 1 |
| Storage Box Actions | 7 | 1 | 6 |
| Servers | 7 | 7 | 0 |
| SSH Keys | 4 | 4 | 0 |
| Reference Data | 3 | 3 | 0 |
| **合計** | **34** | **20** | **14** |

---

## 查詢參數（通用）

| 參數 | 說明 |
|------|------|
| `page` | 分頁頁碼（從 1 開始） |
| `per_page` | 每頁筆數（預設 25，最大 50） |
| `sort` | 排序欄位，可多次使用，格式 `field:asc` / `field:desc` |
| `label_selector` | Label 篩選，支援 `key=value`、`key!=value`、`key in (a,b)`、`!key` |
| `name` | 精確名稱篩選 |
