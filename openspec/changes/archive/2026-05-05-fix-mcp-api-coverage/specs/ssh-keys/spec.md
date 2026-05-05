## MODIFIED Requirements

### Requirement: List SSH keys with pagination
`hetzner_list_ssh_keys` SHALL support optional `page` and `per_page` parameters. When no `page` is specified, the tool SHALL automatically fetch all pages up to a hard cap of 5 pages. When `page` is specified, only that single page SHALL be fetched. Results exceeding the hard cap SHALL include a truncation warning.

`ListSSHKeysResponseSchema` SHALL include the `meta.pagination` envelope so `next_page` can be consumed.

#### Scenario: Auto-pagination fetches all pages
- **WHEN** `hetzner_list_ssh_keys` is called without `page` and keys span multiple pages
- **THEN** all pages up to 5 are fetched and results are combined

#### Scenario: Single-page mode
- **WHEN** `hetzner_list_ssh_keys` is called with `page=1`
- **THEN** only page 1 is fetched and pagination stops

#### Scenario: Mid-stream failure returns partial results
- **WHEN** page 1 succeeds and page 2 fails
- **THEN** tool returns page-1 results with `⚠️ Partial result` warning, not `isError: true`

#### Scenario: First-page failure returns isError
- **WHEN** the API call for page 1 fails
- **THEN** tool returns `isError: true` with `handleApiError` message
