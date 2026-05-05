## 0. Pre-implementation: Live API Verification (Blocking)

- [x] 0.1 Live-call `GET /v1/storage_boxes/{id}/folders` using `HETZNER_API_TOKEN_UNIFIED` and document actual folder object field names in `openspec/changes/implement-missing-hetzner-api-endpoints/verification-logs/folders-schema.md`
- [x] 0.2 Live-call `POST /v1/storage_boxes/{id}/actions/reset_password` (or inspect API docs) and confirm whether response is `{ action, password }` or `{ action }` only; document in `verification-logs/reset-password-response.md`
- [x] 0.3 Confirm `DELETE /v1/storage_boxes/{id}/subaccounts/{username}` response shape (204 No Content vs action object); document in `verification-logs/subaccount-delete-response.md`

## 1. Types: New Schemas in `src/types.ts`

- [x] 1.1 Add `StorageBoxActionResponseSchema` (`z.object({ action: HetznerActionSchema })`) as shared action response; reuse for delete/actions
- [x] 1.2 Add `CreateStorageBoxResponseSchema` and `UpdateStorageBoxResponseSchema` (both wrap `HetznerStorageBoxSchema`)
- [x] 1.3 Add `HetznerFolderSchema` and `ListFoldersResponseSchema` based on Task 0.1 findings
- [x] 1.4 Add `CreateSubaccountResponseSchema` and `UpdateSubaccountResponseSchema` (wrap `HetznerStorageBoxSubaccountSchema`)
- [x] 1.5 Add `ResetPasswordResponseSchema` (`{ action, password?: string }` based on Task 0.2 findings)

## 2. Storage Box CRUD Tools (`src/tools/storage-boxes.ts`)

- [x] 2.1 Implement `hetzner_create_storage_box` — POST /storage_boxes; params: `storage_box_type`, `location`, optional `name`/`labels`/`autodelete`; description warns about cost
- [x] 2.2 Implement `hetzner_update_storage_box` — PUT /storage_boxes/{id}; params: `id`, optional `name`/`labels`/`autodelete`
- [x] 2.3 Implement `hetzner_delete_storage_box` — DELETE /storage_boxes/{id}; `destructiveHint: true`; returns action status
- [x] 2.4 Implement `hetzner_list_storage_box_folders` — GET /storage_boxes/{id}/folders; returns folder list

## 3. Subaccount CRUD Tools (`src/tools/storage-boxes.ts`)

- [x] 3.1 Implement `hetzner_create_storage_box_subaccount` — POST /storage_boxes/{id}/subaccounts; params: `id`, optional `comment`/`labels`/`access_settings`
- [x] 3.2 Implement `hetzner_update_storage_box_subaccount` — PUT /storage_boxes/{id}/subaccounts/{username}; params: `id`, `username`, optional `comment`/`labels`/`access_settings`
- [x] 3.3 Implement `hetzner_delete_storage_box_subaccount` — DELETE /storage_boxes/{id}/subaccounts/{username}; `destructiveHint: true`

## 4. Snapshot Delete Tool (`src/tools/storage-boxes.ts`)

- [x] 4.1 Implement `hetzner_delete_storage_box_snapshot` — DELETE /storage_boxes/{id}/snapshots/{snapshot_id}; `destructiveHint: true`

## 5. Action Tools (`src/tools/storage-boxes.ts`)

- [x] 5.1 Implement `hetzner_change_storage_box_protection` — POST /storage_boxes/{id}/actions/change_protection; params: `id`, `delete` (boolean)
- [x] 5.2 Implement `hetzner_change_storage_box_type` — POST /storage_boxes/{id}/actions/change_type; params: `id`, `storage_box_type`; `destructiveHint: true`
- [x] 5.3 Implement `hetzner_reset_storage_box_password` — POST /storage_boxes/{id}/actions/reset_password; display new password prominently
- [x] 5.4 Implement `hetzner_update_storage_box_access_settings` — POST /storage_boxes/{id}/actions/update_access_settings; params: `id`, optional access booleans
- [x] 5.5 Implement `hetzner_enable_storage_box_snapshot_plan` — POST /storage_boxes/{id}/actions/enable_snapshot_plan; params: `id`, `hour`, optional `minute`/`day_of_week`/`day_of_month`
- [x] 5.6 Implement `hetzner_disable_storage_box_snapshot_plan` — POST /storage_boxes/{id}/actions/disable_snapshot_plan; params: `id`

## 6. Tests (`tests/tools/storage-boxes.test.ts`)

- [x] 6.1 Add tests for Task 2 tools (create, update, delete, list folders) — success markdown, success JSON, isError
- [x] 6.2 Add tests for Task 3 tools (subaccount create, update, delete) — success markdown, success JSON, isError
- [x] 6.3 Add tests for Task 4 (snapshot delete) — success, isError
- [x] 6.4 Add tests for Task 5 tools (all 6 actions) — success, isError; reset_password also tests password display

## 7. Final Verification

- [x] 7.1 Run `bun run test` — all tests must pass
- [x] 7.2 Run `bun run lint` — must pass with 0 warnings
- [x] 7.3 Run `bun run build` — TypeScript compilation must succeed
- [x] 7.4 Update `docs/hetzner-api-reference.md` — change 14 ❌ to ✅ and update coverage table
