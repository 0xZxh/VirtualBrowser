# Teaching Notes

## User preferences

- 目标：私有化部署 + 改 UI + 账号/资产/权限体系；未来可能在指纹浏览器通信层加业务逻辑
- 语言：中文
- 学习风格：边学边做，以本仓库为教学 workspace

## Working notes

- `server/` 基于 vue-element-admin；登录 API 仍指向 mock（`/vue-element-admin/user/*`），二开权限需替换为真实后端
- 浏览器环境 CRUD 走 `server/src/api/native.js` → dev 下 `dev-native-bridge`，生产设计待定
- 当前 `asyncRoutes` 几乎为空，路由级权限框架在但未绑业务页面
- **完整进度与 Agent 交接**：见根目录 [`PROJECT_PROGRESS.md`](../PROJECT_PROGRESS.md)

### 路线 B（当前）

- 已移除外层原厂壳；`Chrome-bin` 仅保留 `VirtualBrowser/146.x` 内层内核
- 开发：`cd server && npm run dev`（浏览器二开 + dev-native-bridge）
- worker：`cd worker && npm run deploy:worker`
- **完整交接见 [`PROJECT_PROGRESS.md`](./PROJECT_PROGRESS.md)**（下个 Agent 首读）
