## ADDED Requirements

### Requirement: Change Protection
`hetzner_change_storage_box_protection` SHALL set or remove delete protection via `POST /storage_boxes/{id}/actions/change_protection`. Required: `id` (number), `delete` (boolean). Returns the action object.

#### Scenario: Enable protection
- **WHEN** `hetzner_change_storage_box_protection` is called with `id` and `delete=true`
- **THEN** the tool returns the action status and confirms protection is enabled

#### Scenario: Action error returns isError
- **WHEN** `hetzner_change_storage_box_protection` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: Change Type
`hetzner_change_storage_box_type` SHALL upgrade or downgrade a Storage Box plan via `POST /storage_boxes/{id}/actions/change_type`. Required: `id` (number), `storage_box_type` (string, e.g. "bx11"). Returns the action object. The tool description SHALL warn that downgrading may cause data loss if current usage exceeds the new plan's capacity, and SHALL mark `destructiveHint: true`.

#### Scenario: Successful type change
- **WHEN** `hetzner_change_storage_box_type` is called with valid `id` and `storage_box_type`
- **THEN** the tool returns the action with status "running" or "success"

#### Scenario: Action error returns isError
- **WHEN** `hetzner_change_storage_box_type` is called with an invalid `storage_box_type`
- **THEN** the tool returns `isError: true`

### Requirement: Reset Password
`hetzner_reset_storage_box_password` SHALL reset the Storage Box password via `POST /storage_boxes/{id}/actions/reset_password`. Required: `id` (number). Returns the new password in the response. The tool SHALL display the new password prominently and warn that it will not be shown again.

#### Scenario: Successful password reset
- **WHEN** `hetzner_reset_storage_box_password` is called with a valid `id`
- **THEN** the tool returns the action and the new password, with a warning to save it immediately

#### Scenario: Reset error returns isError
- **WHEN** `hetzner_reset_storage_box_password` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: Update Access Settings
`hetzner_update_storage_box_access_settings` SHALL update the access protocols of a Storage Box via `POST /storage_boxes/{id}/actions/update_access_settings`. Required: `id` (number). Optional booleans: `ssh_enabled`, `samba_enabled`, `webdav_enabled`, `zfs_enabled`, `reachable_externally`. At least one option SHALL be provided. Returns the action object.

#### Scenario: Disable Samba access
- **WHEN** `hetzner_update_storage_box_access_settings` is called with `id` and `samba_enabled=false`
- **THEN** the tool returns the action confirming the setting change

#### Scenario: Action error returns isError
- **WHEN** `hetzner_update_storage_box_access_settings` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: Enable Snapshot Plan
`hetzner_enable_storage_box_snapshot_plan` SHALL enable an automatic snapshot schedule via `POST /storage_boxes/{id}/actions/enable_snapshot_plan`. Required: `id` (number), `hour` (number 0–23). Optional: `minute` (number 0–59, default 0), `day_of_week` (number 0–7 or null), `day_of_month` (number 1–31 or null). Exactly one of `day_of_week` or `day_of_month` SHALL be set (or both null for daily). Returns the action object.

#### Scenario: Enable daily snapshot
- **WHEN** `hetzner_enable_storage_box_snapshot_plan` is called with `id`, `hour=3`, `day_of_week=null`, `day_of_month=null`
- **THEN** the tool returns the action confirming daily snapshot at 03:00

#### Scenario: Action error returns isError
- **WHEN** `hetzner_enable_storage_box_snapshot_plan` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: Disable Snapshot Plan
`hetzner_disable_storage_box_snapshot_plan` SHALL disable the automatic snapshot schedule via `POST /storage_boxes/{id}/actions/disable_snapshot_plan`. Required: `id` (number). Returns the action object.

#### Scenario: Successful disable
- **WHEN** `hetzner_disable_storage_box_snapshot_plan` is called with a valid `id`
- **THEN** the tool returns the action confirming the snapshot plan is disabled

#### Scenario: Action error returns isError
- **WHEN** `hetzner_disable_storage_box_snapshot_plan` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`
