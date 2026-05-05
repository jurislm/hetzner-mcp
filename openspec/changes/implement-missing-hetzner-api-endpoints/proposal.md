## Why

Hetzner Unified API 提供完整的 Storage Box 管理端點，但 MCP server 目前只實作了讀取類工具（list/get/snapshot create/rollback），缺少 14 個寫入與管理端點，使 AI agent 無法完整管理 Storage Box 生命週期。

## What Changes

- 新增 Storage Box CRUD：建立、更新（重新命名）、刪除 Storage Box；列出資料夾
- 新增 Subaccount 完整管理：建立、更新設定、刪除子帳號
- 新增 Snapshot 刪除：刪除指定 snapshot
- 新增 6 個 Storage Box Actions：change_protection、change_type、reset_password、update_access_settings、enable_snapshot_plan、disable_snapshot_plan

## Capabilities

### New Capabilities

- `storage-box-crud`: Storage Box 的建立（POST）、更新（PUT）、刪除（DELETE）與資料夾列表（GET folders）
- `storage-box-subaccount-crud`: 子帳號的建立（POST）、更新（PUT）、刪除（DELETE）
- `storage-box-snapshot-delete`: 刪除指定 snapshot（DELETE /snapshots/{id}）
- `storage-box-actions`: 6 個管理 action — change_protection、change_type、reset_password、update_access_settings、enable_snapshot_plan、disable_snapshot_plan

### Modified Capabilities

（無，均為新 capability）

## Impact

- **`src/types.ts`**：新增 CreateStorageBoxResponse、UpdateStorageBoxResponse、CreateSubaccountResponse、UpdateSubaccountResponse、SnapshotActionResponse、各 action response schema
- **`src/tools/storage-boxes.ts`**：新增 14 個 MCP tools（`hetzner_create_storage_box`、`hetzner_update_storage_box`、`hetzner_delete_storage_box`、`hetzner_list_storage_box_folders`、`hetzner_create_storage_box_subaccount`、`hetzner_update_storage_box_subaccount`、`hetzner_delete_storage_box_subaccount`、`hetzner_delete_storage_box_snapshot`、`hetzner_change_storage_box_protection`、`hetzner_change_storage_box_type`、`hetzner_reset_storage_box_password`、`hetzner_update_storage_box_access_settings`、`hetzner_enable_storage_box_snapshot_plan`、`hetzner_disable_storage_box_snapshot_plan`）
- **`tests/tools/storage-boxes.test.ts`**：各新工具補充測試
- **`docs/hetzner-api-reference.md`**：更新實作覆蓋率，14 個 ❌ 改為 ✅
