## ADDED Requirements

### Requirement: Create Subaccount
`hetzner_create_storage_box_subaccount` SHALL create a new subaccount via `POST /storage_boxes/{id}/subaccounts`. Required: `id` (number, Storage Box ID). Optional: `comment` (string), `labels` (object), `access_settings` (object with `ssh_enabled`, `samba_enabled`, `webdav_enabled`, `zfs_enabled`, `reachable_externally`, `readonly` booleans). Returns the created subaccount object.

#### Scenario: Successful subaccount creation
- **WHEN** `hetzner_create_storage_box_subaccount` is called with a valid Storage Box `id`
- **THEN** the tool returns the new subaccount including its `username` and access settings

#### Scenario: Creation error returns isError
- **WHEN** `hetzner_create_storage_box_subaccount` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: Update Subaccount
`hetzner_update_storage_box_subaccount` SHALL update an existing subaccount via `PUT /storage_boxes/{id}/subaccounts/{username}`. Required: `id` (number), `username` (string). Optional: `comment`, `labels`, `access_settings`. At least one optional field SHALL be provided. Returns the updated subaccount object.

#### Scenario: Successful access settings update
- **WHEN** `hetzner_update_storage_box_subaccount` is called with `id`, `username`, and updated `access_settings`
- **THEN** the tool returns the subaccount with updated settings

#### Scenario: Update error returns isError
- **WHEN** `hetzner_update_storage_box_subaccount` is called with a non-existent `username`
- **THEN** the tool returns `isError: true`

### Requirement: Delete Subaccount
`hetzner_delete_storage_box_subaccount` SHALL delete a subaccount via `DELETE /storage_boxes/{id}/subaccounts/{username}`. Required: `id` (number), `username` (string). Returns a success confirmation.

#### Scenario: Successful deletion
- **WHEN** `hetzner_delete_storage_box_subaccount` is called with valid `id` and `username`
- **THEN** the tool returns a confirmation message

#### Scenario: Deletion error returns isError
- **WHEN** `hetzner_delete_storage_box_subaccount` is called with a non-existent `username`
- **THEN** the tool returns `isError: true`
