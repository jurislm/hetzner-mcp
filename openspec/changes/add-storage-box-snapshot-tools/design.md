## Context

`hetzner-mcp` v1.0.0 已暴露 17 個 tools（含 3 個 Storage Box read tools），但無 snapshot 管理。Issue #8 acceptance 要求「至少 list + get + snapshot 三件套」，list/get 已實作，缺 snapshot trio。Hetzner Cloud Unified API 已支援 Storage Box snapshot 端點（與既有 list/get 同 base URL），認證沿用 `HETZNER_API_TOKEN_UNIFIED`。

當前模組分布：
- `src/api.ts`：`makeStorageBoxApiRequest` 已支援 GET/POST/PUT/DELETE，Zod 驗證在邊界
- `src/types.ts`：Storage Box / Subaccount schemas 完整
- `src/tools/storage-boxes.ts`：含 `paginatedFetch` helper、`PartialFailure` 結構、`formatStorageBox`/`formatSubaccount` formatter

## Goals / Non-Goals

**Goals:**
- 新增 3 個 tools：`hetzner_list_storage_box_snapshots`、`hetzner_create_storage_box_snapshot`、`hetzner_rollback_storage_box_snapshot`
- 重用既有 `paginatedFetch` 與 `handleApiError` 基礎建設
- rollback 使用新的 `snapshot` body 欄位（name 或 id），避開 2026-04-21 deprecated 的 `snapshot_id`
- destructive 行為（rollback）正確標記 `destructiveHint: true`
- 80%+ 測試覆蓋率，ESLint 0 warnings

**Non-Goals:**
- snapshot plan（enable/disable）— 留待後續 issue
- subaccount create / change_home_directory — issue #8 acceptance 未要求
- delete snapshot — 文件未列為必要，且風險高

## Decisions

### D1：rollback body 使用 `snapshot` 欄位（非 `snapshot_id`）

Hetzner changelog 明示：`snapshot_id` 將於 2026-04-21 移除，新欄位 `snapshot` 接受 name 或 id（string）。實作 from day-1 用新欄位，避免日後 breaking change。

**Alternatives：** 雙欄位並存 → 否決（增加複雜度、deprecated 路徑無實質價值）。

### D2：snapshot list 重用 `paginatedFetch`，create/rollback 直接呼叫 `makeStorageBoxApiRequest`

list 端點同樣返回 `meta.pagination`，重用既有 helper 確保行為一致（5 pages × 50 cap、partial-failure 結構）。create/rollback 是 single-shot POST，無分頁需求。

### D3：`labels` 欄位採 `Record<string, string>` 並 schema 驗證為 optional

Hetzner snapshot 接受 labels（map<string,string>）。Zod 用 `z.record(z.string(), z.string()).optional()`，未傳則於 body 省略（不送 `labels: {}`）。

### D4：Action 回應格式 — 新增 `HetznerActionSchema`

create snapshot 與 rollback 都回傳 `{ action: { id, command, status, progress, started, finished, resources, error } }`。新增共用 `HetznerActionSchema` 給未來 server actions 也能重用（current servers.ts 用的是 power_on/off/reboot 也是 action 但目前未 typed，暫不重構，留註記）。

### D5：rollback 工具的 `idempotentHint`

設 `false`：同一 snapshot 多次 rollback 雖然語意上「狀態相同」，但每次 rollback 都觸發 destructive 動作（覆寫之間 snapshot 後寫入的資料），不能視為冪等。

## Risks / Trade-offs

- **Risk：rollback 誤操作 → 資料遺失**　Mitigation：description 明寫警告 + `destructiveHint: true` + 要求 caller 顯式提供 `snapshot` 名稱／ID（無預設值）
- **Risk：Hetzner API 將 deprecated `snapshot_id` 移除導致 contract 變動**　Mitigation：D1 選新欄位；schema 不引用 deprecated 欄位，未來移除無影響
- **Risk：snapshot label/description 大小限制未知**　Mitigation：Hetzner 邊界錯誤（422）由 `handleApiError` 直接 surface 給 caller，不在 client 端做預判
- **Trade-off：未實作 delete snapshot**　影響：caller 仍需在 Hetzner UI 手動清 snapshot；可在後續 issue 補上

## Migration Plan

1. 在 `develop` worktree 完成實作
2. PR `develop → main`，經 Claude Bot review 後 merge
3. Release Please 自動產生 `feat:` minor bump（v1.0.0 → v1.1.0）
4. main merge 後手動 `bun publish --access public`
5. 更新 `jurislm/CLAUDE.md` 工具計數 17→20

無 rollback 步驟需求（純 additive，不動既有 tool 簽章）。
