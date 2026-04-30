## Context

PR #2 (jurislm/hetzner-mcp#2) adds three Storage Box query tools that target Hetzner's unified API at `https://api.hetzner.com/v1`. The existing tools target the Cloud API at `https://api.hetzner.cloud/v1`. Both APIs accept `Bearer` tokens but issue tokens from different consoles:

- **Cloud token**: issued per project from `console.hetzner.cloud/projects/<id>/security/tokens`. Scope is one Cloud project.
- **Unified token**: issued per account from `console.hetzner.com/account/security/api-tokens`. Scope spans Storage Boxes and other Robot-merged surfaces. Will eventually replace Cloud tokens but the migration is incomplete.

A unified token authenticates against both APIs today (verified empirically). A Cloud token does **not** authenticate against the unified API. Reusing a single env var optimizes for the user with one token and ignores the user with two — and produces opaque `401`s for everyone else.

Repo currently has no test infrastructure: no test script, no test framework, no test files. PR #2's test plan is a manual checklist with all boxes unchecked.

## Goals / Non-Goals

**Goals:**
- Eliminate the silent token-class mismatch by accepting either env var and emitting actionable errors when neither is set.
- Return complete result sets from list endpoints regardless of account size.
- Produce deterministic, locale-independent output suitable for snapshot testing.
- Establish a vitest baseline so future tools can be developed test-first without re-deciding tooling.
- Land all changes within the existing PR (#2) — no separate PR.

**Non-Goals:**
- Backfilling tests for pre-existing tools (`servers`, `ssh-keys`, `reference`) — out of scope; tracked as future work.
- Adding pagination to other list endpoints (`hetzner_list_servers`, `hetzner_list_ssh_keys`) — out of scope; same reason.
- Rewriting `formatBytes` for the existing Cloud-API tools — they don't use this function.
- Integration tests against the live Hetzner API — requires real credentials in CI; out of scope.
- Refactoring the `getApiClient` / `getStorageBoxApiClient` duplication into a single factory parameterized by base URL — keeping the change minimal and focused on review feedback.

## Decisions

### Decision 1: Token resolution — fallback chain over hard split
**Choice**: `getStorageBoxApiClient()` reads `HETZNER_API_TOKEN_UNIFIED` first, then falls back to `HETZNER_API_TOKEN`. If neither is set, throw an error naming both env vars and pointing to the unified-token console URL.

**Alternatives considered**:
- *Hard split (only `HETZNER_API_TOKEN_UNIFIED`)*: rejected — breaks every existing setup that has only `HETZNER_API_TOKEN`.
- *Single var, document the token-class mismatch in README only*: rejected — leaves the silent-401 footgun in place; users must read docs to discover the failure mode.

**Rationale**: Fallback preserves the single-token convenience case (most users) while letting power users supply a separate Cloud token by setting `HETZNER_API_TOKEN_UNIFIED` explicitly. The error message converts the silent failure into a guided one.

### Decision 2: Pagination — fetch-all by default, cap at 5 pages
**Choice**: `hetzner_list_storage_boxes` and `hetzner_list_storage_box_subaccounts` loop while `meta.pagination.next_page` is non-null, accumulating results. Hard cap at 5 pages (250 items at default `per_page=50`) with a warning in output if cap hit. Optional `page` and `per_page` params override the loop and fetch a single page.

**Alternatives considered**:
- *Single page, return `meta.pagination` for caller to handle*: rejected — pushes complexity to the LLM caller; most accounts have <50 boxes so the loop is cheap.
- *Unlimited pages*: rejected — pathological account size could exhaust the 30s axios timeout. 5 pages is enough for 99% of accounts and surfaces clearly when not.

**Rationale**: Default behavior matches user expectation ("list all"). Cap prevents runaway requests. Manual `page`/`per_page` retains escape hatch for power users.

### Decision 3: Byte formatting — switch labels, keep divisors
**Choice**: Keep `1024**3` / `1024**2` divisors but label them `GiB` / `MiB` (binary prefixes per IEC 80000-13).

**Alternatives considered**:
- *Switch to `1000**3` and keep `GB`*: rejected — Hetzner's Cloud Console displays storage in `GiB`, so binary prefixes match what users see.
- *Auto-pick GiB/MiB/KiB based on magnitude*: rejected — unnecessary complexity; storage box quotas are always >1 GiB.

**Rationale**: Smallest correct change.

### Decision 4: Date formatting — ISO 8601 date-only
**Choice**: `paid_until` formatted as `YYYY-MM-DD` via `value.slice(0, 10)`.

**Rationale**: Deterministic, snapshot-testable, locale-independent. Hetzner's API returns ISO 8601 strings, so slicing is safer than re-parsing through `Date`.

### Decision 5: Test framework — vitest
**Choice**: vitest 3.x as devDependency, `tests/` directory at repo root, `*.test.ts` naming convention.

**Alternatives considered**:
- *node:test*: rejected — TypeScript ergonomics weaker (need separate ts-node setup vs vitest's native `tsx`/`tsconfig.json` reuse).
- *jest*: rejected — heavier toolchain (Babel transform vs vitest's esbuild); vitest is the de facto modern choice.

**Rationale**: Vitest is already in the user's other repos (per CLAUDE.md mode 14), so muscle memory carries over. Native ESM + TS support matches this repo's `"type": "module"` config.

### Decision 6: Test scope — pure functions only in this PR
**Choice**: Tests cover `formatBytes`, `formatStorageBox`, `formatSubaccount`. Tool registration and API request paths are not tested in this PR.

**Rationale**: Pure-function tests give immediate ROI with zero mocking. Tool integration tests need a mock MCP server and axios mock — significant scope creep that would block the PR. Track as follow-up.

## Risks / Trade-offs

- **[Risk]** Users who supply only an old Cloud token to `HETZNER_API_TOKEN` and call a Storage Box tool will still get a `401` from `api.hetzner.com` — the fallback chain doesn't validate the token class. → **Mitigation**: README explicitly warns that the unified API needs an account-level token; error message from the API is opaque but at least the env var name in our error message points users at the right console.
- **[Risk]** Pagination loop could hide a Hetzner API change (e.g. `meta.pagination` schema drift). → **Mitigation**: Defensive parse — if `meta.pagination.next_page` is missing or the response shape unexpected, exit the loop after current page. Page count is logged to stderr.
- **[Risk]** ISO date formatting changes user-visible output for existing PR #2 users. → **Mitigation**: PR is unmerged; no users yet.
- **[Trade-off]** Adding vitest as devDependency adds ~30 packages to `node_modules`. → Acceptable cost for unblocking test-driven development.

## Migration Plan

1. Cherry-pick PR #2 commits onto `develop` (already done — rebased branch base).
2. Apply changes per spec in the order in `tasks.md`.
3. Force-push to `claude/hetzner-storage-boxes-tool-zv321` (already done — base now `develop`).
4. Validate via `npm run lint` + `npm run build` + `npm test`.
5. Update PR description to reflect new env var.

**Rollback**: revert the squash commit; old behavior (single env var, no pagination, `GB` labels, no tests) restored.

## Open Questions

None — review findings are concrete enough to act on directly.
