## 1. Types & Schemas

- [x] 1.1 在 `src/types.ts` 新增 `HetznerActionSchema`（id / command / status / progress / started / finished / resources / error）
- [x] 1.2 在 `src/types.ts` 新增 `HetznerStorageBoxSnapshotSchema`（id / name / description / created / size / storage_box / labels）
- [x] 1.3 在 `src/types.ts` 新增 `ListStorageBoxSnapshotsResponseSchema`（snapshots + meta）
- [x] 1.4 在 `src/types.ts` 新增 `CreateStorageBoxSnapshotResponseSchema`（snapshot + action）
- [x] 1.5 在 `src/types.ts` 新增 `RollbackStorageBoxSnapshotResponseSchema`（action）
- [x] 1.6 export 對應 inferred types（`HetznerStorageBoxSnapshot`、`HetznerAction` 等）

## 2. Tool Implementations

- [x] 2.1 在 `src/tools/storage-boxes.ts` 新增 `formatSnapshot()` formatter（id / name / description / created / size in MiB）
- [x] 2.2 註冊 `hetzner_list_storage_box_snapshots`，重用 `paginatedFetch`，annotation `readOnlyHint: true`
- [x] 2.3 註冊 `hetzner_create_storage_box_snapshot`，POST `/storage_boxes/{id}/snapshots`，body 含 optional `description`、`labels`
- [x] 2.4 註冊 `hetzner_rollback_storage_box_snapshot`，POST `/storage_boxes/{id}/actions/rollback_snapshot`，body 用 `snapshot` 欄位，annotation `destructiveHint: true, idempotentHint: false, readOnlyHint: false`，description 警告
- [x] 2.5 確認 `src/index.ts` 透過 `registerStorageBoxTools` 自動載入新 tools（無需改）

## 3. Tests

- [x] 3.1 `tests/tools/storage-boxes.test.ts` 新增 `hetzner_list_storage_box_snapshots` 測試（happy / pagination / 404 / single-page mode）
- [x] 3.2 新增 `hetzner_create_storage_box_snapshot` 測試（with description、no body、422 error）
- [x] 3.3 新增 `hetzner_rollback_storage_box_snapshot` 測試（by id、by name、destructive annotation 驗證）
- [x] 3.4 `formatSnapshot` 單元測試
- [x] 3.5 跑 `bun run test` 全綠，覆蓋率 ≥ 80%

## 4. Quality Gates

- [x] 4.1 `bun run lint` — 0 warnings
- [x] 4.2 `bun run build` — TypeScript 編譯通過
- [x] 4.3 `bun run test` — 全綠（97 tests pass）
- [ ] 4.4 手動 smoke test：`HETZNER_API_TOKEN_UNIFIED=... bun dist/index.js`，呼叫新 tool 確認可連線（runtime 證據）— 須使用者在有 credential 環境執行

## 5. Documentation

- [x] 5.1 更新 `CLAUDE.md` 工具計數 17→20，Storage Boxes 區塊新增 3 個 tools
- [x] 5.2 更新 `README.md`（tools count + token requirement 段落）
- [ ] 5.3 更新 `openspec/specs/storage-boxes.md` 透過 `openspec sync` 同步 delta — 於 archive 階段執行
- [ ] 5.4 同步 `jurislm/CLAUDE.md` 中 hetzner-mcp 描述（17 tools → 20 tools）— 跨 repo，於 PR merge 後另行處理

## 6. Release

- [ ] 6.1 commit `feat: add Storage Box snapshot management tools (closes #8)`
- [ ] 6.2 push `develop` 並開 PR `develop → main`
- [ ] 6.3 PR labels 設 `enhancement`、assignee 設 `terry90918`
- [ ] 6.4 等 Claude Bot review 通過後 merge
- [ ] 6.5 Release Please 版本 PR merge 後手動 `bun publish --access public`
