## Why

PR #2 introduced Storage Box query tools targeting `api.hetzner.com/v1` (Hetzner's unified API) but reused the `HETZNER_API_TOKEN` env var that the existing Cloud API (`api.hetzner.cloud/v1`) tools consume. The two endpoints accept **different token classes** — Cloud-project tokens cannot authenticate against the unified API — so users with only a Cloud token will receive opaque `401` errors with no documentation or hint. In addition, the new tools silently truncate paginated list results at 25 items, label binary-divisor byte units as decimal (`GB` for `1024**3`), use locale-dependent date formatting, and ship without any test coverage in a repo that has no test infrastructure at all.

This change closes the review feedback loop on PR #2 before it merges, and establishes baseline testing infrastructure (`vitest`) so future tools can be developed test-first.

## What Changes

- **BREAKING (env var contract)**: Introduce `HETZNER_API_TOKEN_UNIFIED` for the unified API client; fall back to `HETZNER_API_TOKEN` for backwards compatibility but emit a clear error message naming both possibilities when neither is set.
- Add full pagination handling (`page` / `per_page` params + `meta.pagination` traversal) to `hetzner_list_storage_boxes` and `hetzner_list_storage_box_subaccounts`.
- Replace `formatBytes` binary-divisor output (`1024**3`) labelled `GB` with explicit `GiB` / `MiB` labels.
- Type `HetznerStorageBoxSubaccount.comment` as `string | null` (matches actual API) and update `formatSubaccount` to handle null.
- Format `paid_until` as ISO date (`YYYY-MM-DD`) instead of `toLocaleDateString()` for deterministic output across environments.
- Tighten protocol-key filtering with `as const` tuples typed as `(keyof T)[]` so future typos in the protocol list fail typecheck.
- Update README's authentication section to document the two token types and which tools require which.
- Add `vitest` as devDependency, `test` script in `package.json`, and unit tests for pure formatter functions (`formatBytes`, `formatStorageBox`, `formatSubaccount`).

## Capabilities

### New Capabilities
- `storage-boxes`: Read-only MCP tools for listing, retrieving, and inspecting subaccounts of Hetzner Storage Boxes via the unified API, including pagination, deterministic formatting, and clear authentication errors.
- `test-infrastructure`: Vitest-based unit testing baseline for pure functions, with `npm test` script wiring and a `tests/` directory convention.

### Modified Capabilities
<!-- None — no existing specs in this repo. -->

## Impact

- **Code**: `src/api.ts` (token resolution), `src/tools/storage-boxes.ts` (pagination, formatters, types), `src/types.ts` (`comment` nullability), `README.md` (token docs), `package.json` (test script + vitest devDep), new `tests/` directory.
- **APIs (external)**: No change to which Hetzner endpoints are called; only request behavior changes (pagination loop).
- **APIs (MCP tool surface)**: `hetzner_list_storage_boxes` and `hetzner_list_storage_box_subaccounts` gain optional `page` / `per_page` input parameters (additive — default behavior is "fetch all pages").
- **Dependencies**: `+ vitest` (devDependency only; no runtime impact).
- **Backwards compatibility**: Existing `HETZNER_API_TOKEN` continues to work for both APIs — preserves current setups. New env var is opt-in for users who want to use distinct tokens.
