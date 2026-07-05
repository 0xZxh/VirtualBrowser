# 模块 07 — 后端技术栈（NestJS + 双模式存储）

> **状态：** 🟢 双模式已落地：`STORAGE_DRIVER=local`（SQLite/JSON）开箱即用；生产 `mongo`  
> **交付基线：** [DELIVERY_STANDARD.md](../DELIVERY_STANDARD.md)  
> **最后更新：** 2026-07-04

## 1. 决策

| 项 | 选型 |
|----|------|
| 框架 | **NestJS**（TypeScript） |
| **本地开发** | **零外部依赖**：SQLite 或 JSON 文本（`STORAGE_DRIVER=local`，默认） |
| **生产 / 正式环境** | **MongoDB**（Mongoose，`STORAGE_DRIVER=mongo`） |
| 位置 | [`server-backend/`](../../server-backend/) |
| 端口 | 默认 `3001`（`PORT` 环境变量） |

**原因：** 开发者本机往往**没有** Docker、Mongo、Redis 等；clone 后应 `npm install && npm run start:dev` 即可联调。上线交付时再切 Mongo，API 契约与 Nest 模块边界不变。

---

## 2. 双模式存储（核心约定）

```mermaid
flowchart LR
  subgraph dev [本地开发 STORAGE_DRIVER=local]
    SQLite[(data/local/app.db)]
    JsonOpt[或 data/local/*.json]
    DiskDev[data/profiles/]
  end

  subgraph prod [生产 STORAGE_DRIVER=mongo]
    Mongo[(MongoDB)]
    DiskProd[data/profiles/]
  end

  Nest[NestJS 同一套 API] --> dev
  Nest --> prod
```

| 模式 | 何时用 | 用户 / 会话 | Profile zip | 需要安装 |
|------|--------|-------------|-------------|----------|
| **`local`（默认）** | 本机开发、CI 冒烟 | SQLite `data/local/app.db`（首选）；或 JSON `users.json` + `sessions.json` | 磁盘 `data/profiles/` | **仅 Node 18+** |
| **`mongo`** | staging / 生产 / 客户正式环境 | Mongo `users` / `sessions` | 磁盘或 GridFS（S2 起 tenant 路径） | Node + MongoDB |

**原则：**

1. **API 路径与响应格式两种模式完全一致**（`/auth/*`、`/api/profiles/*`），前端无感知切换。
2. **密码一律 bcrypt**，本地 SQLite/JSON 也不存明文。
3. **Profile 快照 zip 始终落盘**（`DATA_DIR/profiles/`），不强制本机装 Mongo。
4. 通过环境变量 `STORAGE_DRIVER` 切换；**禁止**在代码里写死「只有 Mongo 才能跑」。

### 2.1 本地模式文件布局

```
server-backend/data/
├── local/
│   ├── app.db              # SQLite：users、sessions（推荐）
│   # 或（极简 fallback）
│   ├── users.json
│   └── sessions.json
└── profiles/
    └── {envId}/
        ├── snapshot.zip
        └── meta.json
```

SQLite 表结构（与 Mongo 字段对齐，便于迁移）：

| 表 | 字段 | 说明 |
|----|------|------|
| `users` | id, username, password_hash, name, roles, tenant_id, disabled, created_at | 与 Mongo `users` 同义 |
| `sessions` | token, user_id, expires_at | 与 Mongo `sessions` 同义 |

### 2.2 生产模式（MongoDB）

| 集合 | 说明 |
|------|------|
| `users` | 用户、bcrypt、roles、tenantId |
| `sessions` | Bearer token，TTL 索引 |
| `environments` | S2：ownerId / tenantId |
| `profile_snapshots` | S2：快照元数据（zip 仍可在磁盘） |

---

## 3. 架构（Nest 模块，与存储解耦）

```mermaid
flowchart TB
  subgraph server_backend [server-backend NestJS]
    AppModule[AppModule]
    AuthModule[AuthModule]
    UsersModule[UsersModule]
    ProfilesModule[ProfilesModule]
    StorageModule[StorageModule 抽象层 待建]
  end

  subgraph local [local 驱动]
    SQLite[(SQLite / JSON)]
  end

  subgraph mongo [mongo 驱动]
    MongoDB[(MongoDB)]
  end

  subgraph disk [磁盘 两种模式共用]
    ZipFiles[data/profiles/]
  end

  StorageModule --> local
  StorageModule --> mongo
  AuthModule --> StorageModule
  UsersModule --> StorageModule
  ProfilesModule --> ZipFiles
```

实现上通过 **Repository 接口**（如 `IUserRepository`、`ISessionRepository`）+ `STORAGE_DRIVER` 选择 SQLite 或 Mongoose 实现，避免 Auth/Users 模块直接依赖 Mongo。

---

## 4. 目录结构（目标）

```
server-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── auth/
│   ├── users/
│   ├── profiles/
│   ├── storage/              # 待建：local-sqlite | local-json | mongo
│   │   ├── storage.module.ts
│   │   ├── interfaces/
│   │   └── drivers/
│   └── common/
├── data/                       # gitignore；本地运行时自动生成
│   ├── local/
│   └── profiles/
├── nest-cli.json
├── .env.example
└── legacy-express/
```

---

## 5. API 契约（保持不变）

前端 [`server/`](../../server/) 无需因存储切换而改路径（仍 `/dev-api` → `:3001`）：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查；返回 `storage: local\|mongo` |
| POST | `/auth/login` | `{ code:0, data:{ token, user } }` |
| GET | `/auth/me` | Bearer |
| POST | `/auth/logout` | Bearer |
| GET/POST | `/api/profiles/:envId/snapshot*` | 与现网一致 |
| CRUD | `/api/users` | 标准可交付待建 |

响应格式统一：`{ code: 0 | 4xx, message?, data? }`。

---

## 6. 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3001` | 监听端口 |
| **`STORAGE_DRIVER`** | **`local`** | `local` = SQLite/JSON；`mongo` = MongoDB |
| `SQLITE_PATH` | `./data/local/app.db` | 仅 `local`；SQLite 文件路径 |
| `LOCAL_JSON_DIR` | `./data/local` | 仅 `local` 且 `LOCAL_STORAGE=json` 时 |
| `LOCAL_STORAGE` | `sqlite` | `sqlite` \| `json`（json 为无 native 编译时的 fallback） |
| `MONGODB_URI` | — | **仅 `mongo` 必填** |
| `DATA_DIR` | `./data` | Profile zip 根目录（`profiles/` 在其下） |

见 [`server-backend/.env.example`](../../server-backend/.env.example)。

### 6.1 示例：本地零依赖（推荐日常开发）

```powershell
# .env — 无需 Mongo、无需 Docker
PORT=3001
STORAGE_DRIVER=local
LOCAL_STORAGE=sqlite
SQLITE_PATH=./data/local/app.db
DATA_DIR=./data
```

### 6.2 示例：生产 / 正式环境

```powershell
PORT=3001
STORAGE_DRIVER=mongo
MONGODB_URI=mongodb://user:pass@mongo-host:27017/virtualbrowser
DATA_DIR=/var/lib/virtualbrowser/data
```

---

## 7. 本地启动

```powershell
# 无需安装 MongoDB
cd D:\bytesio\VirtualBrowser\server-backend
npm install
copy .env.example .env
# 确认 .env 中 STORAGE_DRIVER=local
npm run start:dev

# 前端
cd D:\bytesio\VirtualBrowser\server
npm run dev
```

---

## 8. 迁移任务

| ID | 任务 | 验收 |
|----|------|------|
| 7.1 | Nest 脚手架 + Mongo 连接 | `/health` 返回 mongo 状态 | ✅ |
| 7.2 | Auth 模块 parity | login/me/logout 与 Express 行为一致 | ✅ |
| 7.3 | Users 集合 + bcrypt + seed | 重启后 admin 等账号仍在 | ✅ |
| 7.4 | Profiles 模块迁入 Nest | 快照 upload/download 回归 | ✅ |
| 7.5 | 删除 legacy Express | 仅保留 Nest 入口 | ✅ |
| **7.8** | **`StorageModule` + SQLite 本地驱动** | **无 Mongo 时 `STORAGE_DRIVER=local` 可登录；seed 三角色** | ✅ |
| 7.8b | JSON 文本 fallback | `LOCAL_STORAGE=json` 可跑通 auth | ✅ |
| 7.9 | `AppModule` 按 `STORAGE_DRIVER` 动态加载 | `local` 不连 Mongo；`mongo` 不读 SQLite | ✅ |
| 7.6 | `/api/users` + UsersModule | 对接 [02-auth-login](02-auth-login.md) 2.10 | ✅ |
| 7.7 | `environments` 集合 | 对接 [03-rbac](03-rbac-permissions.md) 3.13 |

---

## 9. 关联模块

- [02-auth-login](02-auth-login.md) — 登录与用户管理 API
- [03-rbac-permissions](03-rbac-permissions.md) — Guards / Roles
- [05-profile-cloud-sync](05-profile-cloud-sync.md) — 快照 API
- [06-deployment](06-deployment.md) — **生产必须 `STORAGE_DRIVER=mongo`**
