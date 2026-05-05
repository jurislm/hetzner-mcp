# Verification: GET /storage_boxes/{id}/folders

Date: 2026-05-05  
Box: 561406  
Token: HETZNER_API_TOKEN (fallback)

## Response

```json
{
  "folders": [
    "backup",
    ".ssh"
  ]
}
```

## Conclusion

`folders` 是 `string[]`，不是物件陣列。Schema：
```typescript
z.object({ folders: z.array(z.string()) })
```
