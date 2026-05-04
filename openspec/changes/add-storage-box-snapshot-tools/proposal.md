## Why

Issue #8 acceptance 要求至少實作 Storage Box snapshot 三件套（list / create / rollback），讓 lawyer dev 跨環境遷移與長期 Coolify scheduled DB backup 可以推送至 Storage Box 並透過 MCP 觸發手動 snapshot 與 rollback，避免目前只能在 Hetzner Robot UI 手動操作的痛點。Hetzner Cloud Unified API 已支援 Storage Box snapshot 端點（不需走 Robot API），可直接沿用現有 `HETZNER_API_TOKEN_UNIFIED` 與 `makeStorageBoxApiRequest` client。

## What Changes

- 新增 3 個 MCP tools 至 `src/tools/storage-boxes.ts`：
  - `hetzner_list_storage_box_snapshots` — GET `/storage_boxes/{id}/snapshots`（支援分頁，重用既有 `paginatedFetch`）
  - `hetzner_create_storage_box_snapshot` — POST `/storage_boxes/{id}/snapshots`（接受可選 `description`、`labels`）
  - `hetzner_rollback_storage_box_snapshot` — POST `/storage_boxes/{id}/actions/rollback_snapshot`（**destructive**，使用新 `snapshot` 欄位避開 2026-04-21 deprecated 的 `snapshot_id`）
- `src/types.ts` 新增 Zod schemas：`HetznerStorageBoxSnapshotSchema`、`HetznerActionSchema`、list/create/rollback response schemas
- 工具總數 17 → 20，CLAUDE.md 與 README.md 同步更新
- Storage Boxes spec（`openspec/specs/storage-boxes.md`）新增 snapshot 管理相關 requirements

## Capabilities

### New Capabilities
（無新 capability，沿用既有 `storage-boxes`）

### Modified Capabilities
- `storage-boxes`: 新增 snapshot 列表、即時 snapshot 觸發、rollback 三個 requirement，原 list/get/list-subaccounts 不變

## Impact

- 程式碼：`src/types.ts`（新 schemas）、`src/tools/storage-boxes.ts`（新 3 個 tool）；`src/api.ts` 不需新增 client（沿用 `makeStorageBoxApiRequest`）
- 測試：`tests/tools/storage-boxes.test.ts` 新增 snapshot 三件套測試（含 happy path、分頁、404、rollback destructive 標記）
- 文件：`CLAUDE.md`（工具清單 17→20）、`README.md`（同步）、`openspec/specs/storage-boxes.md`（新 requirements）
- API：使用既有 `HETZNER_API_TOKEN_UNIFIED`，無新 credential 需求
- 相依：無新增 dependency
- 風險：rollback 為 destructive 操作（資料覆寫），須在 tool annotation 標 `destructiveHint: true` 並於 description 警告
