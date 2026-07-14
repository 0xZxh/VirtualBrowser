# 2026-07-11 — 客户安装包 + 三轨交付决策

## 决策

1. **客户端：** `VirtualBrowser-Setup.exe` — 新建 `desktop-shell/`（二开 Electron），嵌入 `server/dist` + 本地指纹内核；**不恢复**原厂 `app.asar`
2. **云端：** `server-backend` 独立部署（MongoDB + HTTPS）— 登录、用户、环境、云快照
3. **COMPAT API（S8）：** Apifox 协议 `:9000` + `api-key`，执行计划见 `backend_native_api_整合`
4. **开发态不变：** `npm run dev` + dev-native-bridge + 本机 SQLite

## Multitask

- 批次 0 文档同步已完成（`AGENT_COORDINATION.md`）
- `native-runtime.js` 全项目单点实现（INFRA-A）

## 相关

- [`.cursor/plans/客户端安装包交付_33a8c0a6.plan.md`](../.cursor/plans/客户端安装包交付_33a8c0a6.plan.md)
- [`docs/AGENT_COORDINATION.md`](../docs/AGENT_COORDINATION.md)
