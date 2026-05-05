## ADDED Requirements

### Requirement: Delete Snapshot
`hetzner_delete_storage_box_snapshot` SHALL delete a specific snapshot via `DELETE /storage_boxes/{id}/snapshots/{snapshot_id}`. Required: `id` (number, Storage Box ID), `snapshot_id` (string, snapshot name or numeric ID). Returns a success confirmation. The tool description SHALL warn that this operation is irreversible.

#### Scenario: Successful snapshot deletion
- **WHEN** `hetzner_delete_storage_box_snapshot` is called with valid `id` and `snapshot_id`
- **THEN** the tool returns a confirmation that the snapshot was deleted

#### Scenario: Deletion of non-existent snapshot returns isError
- **WHEN** `hetzner_delete_storage_box_snapshot` is called with an invalid `snapshot_id`
- **THEN** the tool returns `isError: true` with the API error message
