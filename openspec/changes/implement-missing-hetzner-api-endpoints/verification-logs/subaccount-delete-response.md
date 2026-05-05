# Verification: DELETE /storage_boxes/{id}/subaccounts/{username}

Date: 2026-05-05  
Source: Context7 + pattern inference

## Conclusion

Context7 未明確列出 DELETE subaccount 的 response body。根據 Hetzner Unified API 的一致性原則（所有 destructive 操作回傳 action 物件），推測為 `{ action: {...} }`。

但為防止 204 No Content 或其他 schema，實作時使用 `z.unknown()` 並在 handler 直接回傳「已刪除」確認訊息，不依賴 response 內容。這樣即使回傳 204 也能正常運作。
