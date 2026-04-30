## ADDED Requirements

### Requirement: Vitest as the test framework
The repository SHALL adopt vitest 3.x as its unit test framework. `vitest` MUST appear in `devDependencies` of `package.json`. A `test` script in `package.json` MUST invoke vitest in non-watch mode (`vitest run`).

#### Scenario: Test script available
- **WHEN** a developer runs `npm test`
- **THEN** vitest executes in run-once mode and exits with code 0 if all tests pass

#### Scenario: Vitest version constraint
- **WHEN** `package.json` is inspected
- **THEN** the `devDependencies.vitest` semver range starts at `^3.` or higher

### Requirement: Test directory convention
Test files SHALL live under `tests/` at the repository root, mirroring the `src/` directory tree. Files MUST be named `<module>.test.ts`.

#### Scenario: Locating a test
- **WHEN** a source module is at `src/tools/storage-boxes.ts`
- **THEN** its tests live at `tests/tools/storage-boxes.test.ts`

### Requirement: Pure-function test coverage for storage-boxes
The `storage-boxes` module's pure formatter functions (`formatBytes`, `formatStorageBox`, `formatSubaccount`) MUST have unit tests covering at least the scenarios enumerated in `specs/storage-boxes/spec.md`.

#### Scenario: Coverage check
- **WHEN** vitest is run with `--coverage` against `src/tools/storage-boxes.ts`
- **THEN** the three pure formatter functions show ≥80% line coverage

### Requirement: Tests do not require live API credentials
Unit tests for the storage-boxes module MUST NOT make network calls and MUST NOT require `HETZNER_API_TOKEN` or `HETZNER_API_TOKEN_UNIFIED` to be set.

#### Scenario: Test run without env
- **WHEN** `npm test` is run with no `HETZNER_*` env vars set
- **THEN** all tests pass
