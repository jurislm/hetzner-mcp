## ADDED Requirements

### Requirement: List Storage Box Snapshots

The MCP server SHALL expose a `hetzner_list_storage_box_snapshots` tool that retrieves snapshots for a given Storage Box, with the same pagination semantics as `hetzner_list_storage_box_subaccounts` (default fetch all pages capped at 5 pages × 50 items, supports explicit `page` / `per_page` for single-page mode).

#### Scenario: List all snapshots of a Storage Box

- **WHEN** caller invokes `hetzner_list_storage_box_snapshots` with valid `id` and no pagination params
- **THEN** server calls GET `/storage_boxes/{id}/snapshots`, validates response with Zod, paginates up to 5 pages, returns markdown with snapshot id / name / description / created timestamp / size, or empty-state message when none exist

#### Scenario: Storage Box not found

- **WHEN** caller passes an `id` that does not exist (HTTP 404)
- **THEN** server returns `isError: true` content with handleApiError-formatted message ("Resource not found …")

#### Scenario: Single-page mode

- **WHEN** caller supplies explicit `page` parameter
- **THEN** server fetches exactly that page (no auto-pagination), respecting `per_page` (default 50, max 50)

### Requirement: Create Storage Box Snapshot

The MCP server SHALL expose a `hetzner_create_storage_box_snapshot` tool that triggers an on-demand snapshot for a given Storage Box via POST `/storage_boxes/{id}/snapshots`, accepting optional `description` and `labels` in the request body and returning the created snapshot id plus the action envelope.

#### Scenario: Create snapshot with description

- **WHEN** caller passes `id` and `description: "pre-migration backup"`
- **THEN** server posts `{ description, labels }` (labels omitted), validates the response, returns markdown including the new snapshot id and the action status

#### Scenario: Create snapshot with no body

- **WHEN** caller passes only `id`
- **THEN** server posts an empty JSON body `{}`, the snapshot is created with auto-generated name, server returns success markdown

#### Scenario: API error propagation

- **WHEN** Hetzner returns HTTP 422 (e.g., snapshot quota exceeded)
- **THEN** tool returns `isError: true` with the API's error message surfaced via handleApiError

### Requirement: Rollback Storage Box Snapshot

The MCP server SHALL expose a `hetzner_rollback_storage_box_snapshot` tool that rolls a Storage Box back to a snapshot via POST `/storage_boxes/{id}/actions/rollback_snapshot`, using the new `snapshot` body field (name or ID) and NOT the deprecated `snapshot_id` field. The tool MUST be annotated `destructiveHint: true` and MUST include a warning in its description that this overwrites current data.

#### Scenario: Rollback by snapshot id

- **WHEN** caller passes `id: 42` and `snapshot: "12345"` (or numeric)
- **THEN** server posts `{ "snapshot": "12345" }` to the rollback action endpoint, returns markdown with the resulting action id and status

#### Scenario: Rollback by snapshot name

- **WHEN** caller passes `snapshot: "pre-migration-backup"`
- **THEN** server forwards the name verbatim and returns the action envelope

#### Scenario: Tool annotations declare destructive

- **WHEN** the tool is registered with the MCP server
- **THEN** its annotations include `destructiveHint: true`, `idempotentHint: false`, `readOnlyHint: false`, and the description explicitly warns that rollback overwrites data after the snapshot point
