## 0. Pre-implementation: Verify Subaccount Schema (Blocking)

- [x] 0.1 Live-call `GET /v1/storage_boxes/{id}/subaccounts` using `HETZNER_API_TOKEN_UNIFIED` and compare actual field names to `HetznerStorageBoxSubaccountSchema` in `src/types.ts`; document result in `openspec/changes/fix-mcp-api-coverage/verification-logs/subaccount-schema.md`

## 1. Refactor: Extract Generic `createPaginatedFetch` Factory

- [x] 1.1 Add `createPaginatedFetch<T>(requestFn)` factory to `src/api.ts`; the factory wraps any `requestFn` and implements the auto-paginate / hard-cap / partial-failure pattern currently in `paginatedFetch`
- [x] 1.2 Migrate `paginatedFetch` in `src/tools/storage-boxes.ts` to use the new factory (remove inline pagination logic, call `createPaginatedFetch(makeStorageBoxApiRequest)`)
- [x] 1.3 Add unit tests for `createPaginatedFetch` in `tests/api.test.ts` covering: auto-paginate, hard-cap truncation warning, mid-stream partial failure, single-page mode

## 2. Servers: Add Pagination Support

- [x] 2.1 Add `meta` envelope to `ListServersResponseSchema` in `src/types.ts` (mirror `StorageBoxListResponseSchema.meta`)
- [x] 2.2 Add optional `page` / `per_page` params to `hetzner_list_servers` inputSchema in `src/tools/servers.ts`; wire handler to `createPaginatedFetch(makeApiRequest)` from task 1.1
- [x] 2.3 Update `tests/tools/servers.test.ts`: add auto-paginate test, single-page mode test, mid-stream partial-failure test, first-page-failure `isError` test

## 3. SSH Keys: Add Pagination Support

- [x] 3.1 Add `meta` envelope to `ListSSHKeysResponseSchema` in `src/types.ts`
- [x] 3.2 Add optional `page` / `per_page` params to `hetzner_list_ssh_keys` inputSchema in `src/tools/ssh-keys.ts`; wire handler to `createPaginatedFetch(makeApiRequest)` from task 1.1
- [x] 3.3 Update `tests/tools/ssh-keys.test.ts`: add auto-paginate test, single-page mode test, mid-stream partial-failure test, first-page-failure `isError` test

## 4. Storage Boxes: Add Filter Parameters

- [x] 4.1 Add optional `label_selector` (string) and `name` (string) params to `hetzner_list_storage_boxes` inputSchema in `src/tools/storage-boxes.ts`; forward as query params in the `paginatedFetch` call
- [x] 4.2 Add optional `username` (string) param to `hetzner_list_storage_box_subaccounts` inputSchema in `src/tools/storage-boxes.ts`; forward as query param to `GET /storage_boxes/{id}/subaccounts`
- [x] 4.3 Update `tests/tools/storage-boxes.test.ts`: add filter-by-label test, filter-by-name test, filter-by-username test, no-filter returns all test

## 5. Subaccount Schema Fix (Conditional on Task 0.1)

- [x] 5.1 If task 0.1 finds field mismatches: update `HetznerStorageBoxSubaccountSchema` in `src/types.ts` to match unified API field names
- [x] 5.2 If schema changed: update `formatSubaccount` in `src/tools/storage-boxes.ts` to reference new field names
- [x] 5.3 If schema changed: update related tests in `tests/tools/storage-boxes.test.ts` and `tests/types.test.ts` to use corrected field names

## 6. Final Verification

- [x] 6.1 Run `bun run test` — all tests must pass (expect 130+ tests after new additions)
- [x] 6.2 Run `bun run lint` — must pass with 0 warnings
- [x] 6.3 Run `bun run build` — TypeScript compilation must succeed
- [x] 6.4 Update coverage table in `docs/hetzner-api-reference.md` to reflect new pagination and filter capabilities
