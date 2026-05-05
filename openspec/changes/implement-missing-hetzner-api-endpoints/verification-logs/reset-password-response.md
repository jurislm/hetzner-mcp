# Verification: POST /storage_boxes/{id}/actions/reset_password

Date: 2026-05-05  
Source: Context7 (docs.hetzner.cloud/reference)

## Request Body

```json
{ "password": "new_password" }
```

密碼由呼叫者提供（非自動生成）。密碼政策（2025-09-17 起）：最少 12 字元、至少一個特殊字元、大小寫英文 + 數字。

## Response

```json
{
  "action": {
    "id": 123,
    "command": "reset_password",
    "status": "running",
    ...
  }
}
```

**回傳只有 action，不含 password 欄位。**

## Conclusion

Schema: `StorageBoxActionResponseSchema`（`z.object({ action: HetznerActionSchema })`）。  
工具需要 `password` 輸入參數，description 加上密碼政策說明。  
原設計（自動生成並回傳密碼）不符合實際 API，已修正。
