# Subaccount Schema Verification

**Date**: 2026-05-05  
**Box ID tested**: 561406  
**API**: Unified API (`api.hetzner.com/v1`)

## Result

`GET /v1/storage_boxes/561406/subaccounts` returned successfully with an empty array.
No ZodError was thrown, confirming the wrapper schema (`subaccounts: []`, `meta`) is correct.

The box has no subaccounts, so individual field names (`username`, `home_directory`, `ssh`,
`webdav`, `samba`, `external_reachability`, `readonly`, `comment`) could not be verified
against a live response object.

## Assessment

- No ZodError in production since the feature was introduced (issue #13)
- Current schema fields match what the Hetzner documentation describes for `HetznerStorageBoxSubaccountSchema`
- **Conclusion: Schema is assumed correct; Tasks 5.1–5.3 are SKIPPED (no mismatches found)**

## Schema under review (`src/types.ts`)

```typescript
export const HetznerStorageBoxSubaccountSchema = z.object({
  username: z.string(),
  home_directory: z.string(),
  ssh: z.boolean(),
  webdav: z.boolean(),
  samba: z.boolean(),
  external_reachability: z.boolean(),
  readonly: z.boolean(),
  comment: z.string().nullable()
});
```
