## MODIFIED Requirements

### Requirement: List storage boxes with label and name filters
`hetzner_list_storage_boxes` SHALL accept optional `label_selector` (string) and `name` (string) parameters. When provided, these SHALL be forwarded as query parameters to `GET /storage_boxes`. Either or both may be specified simultaneously.

#### Scenario: Filter by label_selector
- **WHEN** `hetzner_list_storage_boxes` is called with `label_selector="env=prod"`
- **THEN** only Storage Boxes matching the label are returned

#### Scenario: Filter by name
- **WHEN** `hetzner_list_storage_boxes` is called with `name="my-box"`
- **THEN** only the Storage Box with that exact name is returned (or empty if none match)

#### Scenario: Filter and pagination combine
- **WHEN** `hetzner_list_storage_boxes` is called with `label_selector` and no `page`
- **THEN** auto-pagination applies to the filtered result set

### Requirement: List subaccounts with username filter
`hetzner_list_storage_box_subaccounts` SHALL accept an optional `username` (string) parameter. When provided, it SHALL be forwarded as a query parameter to `GET /storage_boxes/{id}/subaccounts`.

#### Scenario: Filter subaccounts by username
- **WHEN** `hetzner_list_storage_box_subaccounts` is called with `id=42` and `username="u12345-sub1"`
- **THEN** only the subaccount with that username is returned

#### Scenario: No username filter returns all subaccounts
- **WHEN** `hetzner_list_storage_box_subaccounts` is called without `username`
- **THEN** all subaccounts for the storage box are returned (auto-paginated)

### Requirement: Subaccount schema matches unified API
`HetznerStorageBoxSubaccountSchema` SHALL match the actual field names returned by `GET /v1/storage_boxes/{id}/subaccounts` on the unified API (`api.hetzner.com`). The schema SHALL be verified against a live API response before implementation is marked complete.

#### Scenario: Subaccount schema parses without ZodError
- **WHEN** `hetzner_list_storage_box_subaccounts` is called against the live unified API
- **THEN** the response parses without ZodError (no unexpected field names or missing required fields)
