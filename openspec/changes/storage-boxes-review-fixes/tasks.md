## 1. Test infrastructure setup

- [ ] 1.1 Add `vitest` `^3` to `devDependencies` in `package.json`
- [ ] 1.2 Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`
- [ ] 1.3 Run `npm install` to populate lockfile and `node_modules`
- [ ] 1.4 Create `tests/` directory and add `.gitkeep` if empty (will be populated in §3)

## 2. Storage Boxes — code changes

- [ ] 2.1 Update `getStorageBoxApiClient()` in `src/api.ts` to read `HETZNER_API_TOKEN_UNIFIED` first, fall back to `HETZNER_API_TOKEN`, throw a clear multi-line error citing both env vars and the unified-token console URL when neither is set
- [ ] 2.2 Change `HetznerStorageBoxSubaccount.comment` in `src/types.ts` to `string | null`
- [ ] 2.3 Add pagination types to `src/types.ts`: `Pagination` (with `next_page: number | null`) and `Meta` interfaces
- [ ] 2.4 Update `ListStorageBoxesResponse` and `ListStorageBoxSubaccountsResponse` in `src/types.ts` to include optional `meta?: Meta`
- [ ] 2.5 Replace `formatBytes` body in `src/tools/storage-boxes.ts` to label output `GiB` / `MiB`
- [ ] 2.6 Replace `paid_until` formatting in `formatStorageBox` to `value.slice(0, 10)`
- [ ] 2.7 Replace protocol-key arrays in `formatStorageBox` and `formatSubaccount` with `as const` tuples typed as `(keyof T)[]`
- [ ] 2.8 Update `formatSubaccount` to handle `comment: null` and empty-string cases (no `Comment:` line emitted)
- [ ] 2.9 Add `paginatedFetch<T>(endpoint, page?, perPage?)` helper at top of `storage-boxes.ts` (or extract to shared util) that loops `meta.pagination.next_page` up to 5 pages and returns `{ items: T[]; truncated: boolean }`
- [ ] 2.10 Update `hetzner_list_storage_boxes` `inputSchema` with optional `page` and `per_page` params; route to `paginatedFetch` or single-page fetch accordingly
- [ ] 2.11 Update `hetzner_list_storage_box_subaccounts` `inputSchema` and behavior the same way
- [ ] 2.12 In list-tool markdown output, append warning line `> ⚠️ Truncated at 5 pages — supply explicit \`page\` to fetch more.` when `truncated: true`. In JSON output, return `{ storage_boxes: [...], truncated: true }`.

## 3. Tests — pure functions

- [ ] 3.1 Export `formatBytes`, `formatStorageBox`, `formatSubaccount` from `src/tools/storage-boxes.ts` so they can be imported by tests
- [ ] 3.2 Create `tests/tools/storage-boxes.test.ts` with `describe`/`it` blocks covering every scenario in `specs/storage-boxes/spec.md` for the three pure functions (`formatBytes` ×3, `formatStorageBox` ×2 paid_until cases, `formatSubaccount` ×3 comment cases)
- [ ] 3.3 Run `npm test` and confirm all tests pass
- [ ] 3.4 Confirm tests pass with no `HETZNER_*` env vars set (`unset HETZNER_API_TOKEN HETZNER_API_TOKEN_UNIFIED && npm test`)

## 4. README documentation

- [ ] 4.1 Add a "Storage Boxes — token requirements" subsection to README explaining: unified API needs an account-level token from `console.hetzner.com/account/security/api-tokens`; Cloud-project tokens won't work for storage box endpoints; `HETZNER_API_TOKEN_UNIFIED` env var takes precedence over `HETZNER_API_TOKEN`
- [ ] 4.2 Add a row to the tools table noting which tools need which token class

## 5. Validation

- [ ] 5.1 Run `npm run lint` — must pass with `--max-warnings=0`
- [ ] 5.2 Run `npm run build` — must succeed with zero TypeScript errors
- [ ] 5.3 Run `npm test` — must pass
- [ ] 5.4 Run `openspec status --change storage-boxes-review-fixes` — confirm all artifacts done

## 6. Commit and push

- [ ] 6.1 Stage all changes (`src/`, `tests/`, `package.json`, `package-lock.json`, `README.md`, `openspec/changes/storage-boxes-review-fixes/`)
- [ ] 6.2 Commit with conventional-commits message (`fix(storage-boxes): address PR #2 review findings`) — body listing finding numbers #1–#8
- [ ] 6.3 `git push origin claude/hetzner-storage-boxes-tool-zv321`
- [ ] 6.4 Update PR #2 description to reflect new env var contract
