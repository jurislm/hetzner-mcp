## MODIFIED Requirements

### Requirement: List servers with pagination
`hetzner_list_servers` SHALL support optional `page` and `per_page` parameters. When no `page` is specified, the tool SHALL automatically fetch all pages up to a hard cap of 5 pages (125 servers at per_page=25). When `page` is specified, only that single page SHALL be fetched. Results exceeding the hard cap SHALL include a truncation warning in the output.

`ListServersResponseSchema` SHALL include the `meta.pagination` envelope so `next_page` can be consumed by the pagination loop.

#### Scenario: Auto-pagination fetches all pages
- **WHEN** `hetzner_list_servers` is called without a `page` parameter and the account has servers across multiple pages
- **THEN** the tool fetches all pages up to 5 and returns a combined list

#### Scenario: Auto-pagination truncates at hard cap
- **WHEN** `hetzner_list_servers` is called without `page` and the account has > 125 servers
- **THEN** the response includes all servers from pages 1–5 AND a `⚠️ Truncated at 5 pages` warning

#### Scenario: Single-page mode bypasses auto-pagination
- **WHEN** `hetzner_list_servers` is called with `page=2` and `per_page=10`
- **THEN** only page 2 is fetched; `next_page` in the response is ignored

#### Scenario: Mid-stream failure returns partial results
- **WHEN** auto-pagination succeeds on page 1 but fails on page 2
- **THEN** the tool returns the page-1 results with a `⚠️ Partial result` warning (not `isError: true`)

#### Scenario: First-page failure returns isError
- **WHEN** the first API call fails (network error or 401)
- **THEN** the tool returns `isError: true` with the error message from `handleApiError`
