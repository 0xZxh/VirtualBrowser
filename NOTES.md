# Teaching Notes

## User preferences

- 目标：私有化部署 + 改 UI + 账号/资产/权限体系；Cookie/缓存上云跨机同步
- 语言：中文
- 学习风格：边学边做，以本仓库为教学 workspace

## Working notes

- 目标：**标准可交付**私有化产品（见 [`docs/DELIVERY_STANDARD.md`](docs/DELIVERY_STANDARD.md)）
- **模块开发清单：** [`docs/README.md`](docs/README.md)
- **跨模块衔接：** [`docs/INTEGRATION.md`](docs/INTEGRATION.md)
- **Agent 交接（架构/命令/常见坑）：** [`PROJECT_PROGRESS.md`](PROJECT_PROGRESS.md)
- 登录已对接 `server-backend`（Nest `/auth/*`）；用户管理见 `/system/users`
- 云同步暂需 `CLOUD_API_TOKEN`（见 INTEGRATION §Auth→Cloud，S3 待做）
- **跨平台预备（2026-07-15）：** 数据目录见 `config/vb-paths.js`；指纹 OS 可选 macOS/Linux（UA）；**客户端内核仍仅 Windows**（MISSION Out of scope）
- **Mac 前端开发：** 见 [`docs/MAC_FRONTEND_DEV.md`](docs/MAC_FRONTEND_DEV.md)；不跑装包，先打磨 `server` + `worker`

### 路线 B（当前）

- 已移除外层原厂壳；`Chrome-bin` 仅保留 `VirtualBrowser/146.x` 内层内核
- 开发：`server-backend npm start` + `cd server && npm run dev`
- worker：`cd worker && npm run deploy:worker`
