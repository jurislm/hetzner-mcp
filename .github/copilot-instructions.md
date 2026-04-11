# Copilot Instructions

## 語言與執行環境
- 此專案使用 Node.js（TypeScript，ESM），為 MCP Server
- 禁止使用 `any` 類型，測試檔案除外

## 程式碼風格
- 預設使用 `const`；僅在需要重新賦值時使用 `let`，不使用 `var`
- 非同步函式統一使用 `async/await`，避免 `.then()` chain
- 下劃線前綴（`_param`）表示刻意不使用的參數，ESLint 允許此模式

## 測試
- 測試框架依 package.json 設定，新功能必須附帶單元測試

## Code Review 重點
- 標記任何 `eval()` 或 `new Function()` 使用為安全疑慮
- 用戶輸入直接拼接到字串中（潛在 injection）需標記
- `async` 函式缺少 try/catch 或 `.catch()` 需提醒（unhandled rejection 風險）

## 忽略範圍
- 不審查 `node_modules/`、`dist/`、`coverage/` 目錄下的檔案
