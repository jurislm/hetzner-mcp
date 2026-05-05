## ADDED Requirements

### Requirement: Create Storage Box
`hetzner_create_storage_box` SHALL create a new Storage Box via `POST /storage_boxes`. Required parameters: `storage_box_type` (string) and `location` (string). Optional: `name` (string), `labels` (object), `autodelete` (boolean). Returns the created Storage Box object.

#### Scenario: Successful creation returns storage box details
- **WHEN** `hetzner_create_storage_box` is called with valid `storage_box_type` and `location`
- **THEN** the tool returns the newly created Storage Box including its `id`, `username`, `server`, and `status`

#### Scenario: Creation error returns isError
- **WHEN** `hetzner_create_storage_box` is called with an invalid `storage_box_type`
- **THEN** the tool returns `isError: true` with the API error message

### Requirement: Update Storage Box
`hetzner_update_storage_box` SHALL update an existing Storage Box via `PUT /storage_boxes/{id}`. Required: `id` (number). Optional: `name` (string), `labels` (object), `autodelete` (boolean). At least one optional field SHALL be provided. Returns the updated Storage Box object.

#### Scenario: Successful rename
- **WHEN** `hetzner_update_storage_box` is called with `id=42` and `name="new-name"`
- **THEN** the tool returns the Storage Box with the updated name

#### Scenario: Update error returns isError
- **WHEN** `hetzner_update_storage_box` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: Delete Storage Box
`hetzner_delete_storage_box` SHALL delete a Storage Box via `DELETE /storage_boxes/{id}`. Required: `id` (number). Returns the action object. The tool SHALL include a clear warning in its description that this operation is irreversible and deletes all data.

#### Scenario: Successful deletion returns action
- **WHEN** `hetzner_delete_storage_box` is called with a valid `id`
- **THEN** the tool returns the action status (e.g., "running")

#### Scenario: Deletion error returns isError
- **WHEN** `hetzner_delete_storage_box` is called with a non-existent `id`
- **THEN** the tool returns `isError: true`

### Requirement: List Storage Box Folders
`hetzner_list_storage_box_folders` SHALL list folders inside a Storage Box via `GET /storage_boxes/{id}/folders`. Required: `id` (number). Returns a list of folder objects.

#### Scenario: Successful folder listing
- **WHEN** `hetzner_list_storage_box_folders` is called with a valid `id`
- **THEN** the tool returns a list of folders with their names and metadata

#### Scenario: Empty folder list
- **WHEN** `hetzner_list_storage_box_folders` is called and the Storage Box has no folders
- **THEN** the tool returns an appropriate empty-state message
