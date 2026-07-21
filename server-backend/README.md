# VirtualBrowser Backend（NestJS）

自建后端：Auth + Profile 快照。**本地零依赖**（SQLite）/ **生产 MongoDB** 双模式。

## 存储模式

| 模式 | 环境变量 | 说明 |
|------|----------|------|
| **本地（默认）** | `STORAGE_DRIVER=local` | SQLite（`LOCAL_STORAGE=sqlite`）或 JSON，**无需 Mongo/Docker** |
| **生产** | `STORAGE_DRIVER=mongo` | 正式环境 MongoDB |

详见 [docs/modules/07-backend-stack.md](../docs/modules/07-backend-stack.md)。

## 本地启动

```powershell
cd D:\bytesio\VirtualBrowser\server-backend
npm install
copy .env.example .env
npm run start:dev
```

生产：`STORAGE_DRIVER=mongo` + `MONGODB_URI`，然后 `npm run build` → `npm start`。

默认管理 API：`http://localhost:3001`；Compat 自动化 API：`http://localhost:9000`（`COMPAT_API_PORT`）。

**生产/客户机房部署请按手册操作：** [`docs/CLOUD_DEPLOY.md`](../docs/CLOUD_DEPLOY.md)（Mongo + Nginx HTTPS + systemd + 验收命令）。

## 测试账号（seed）

| 账号 | 密码 | 角色 |
|------|------|------|
| admin | admin123 | admin |
| operator | operator123 | operator |
| viewer | viewer123 | viewer |

首次启动且用户表为空时自动写入；密码为 bcrypt 哈希。SQLite 文件：`data/local/app.db`。

## API 摘要

| 类别 | 路径 |
|------|------|
| 认证 | `POST /auth/login`、`GET /auth/me`、`POST /auth/logout` |
| 用户管理 | `GET/POST/PUT/DELETE /api/users`（admin） |
| Profile 快照 | `GET/POST /api/profiles/:envId/snapshot` 等 |

## 与 dev 联调

```powershell
cd server-backend && npm run start:dev
cd server && npm run dev
```

## 文档索引

- [DELIVERY_STANDARD.md](../docs/DELIVERY_STANDARD.md)
- [07-backend-stack.md](../docs/modules/07-backend-stack.md)
- [06-deployment.md](../docs/modules/06-deployment.md)
