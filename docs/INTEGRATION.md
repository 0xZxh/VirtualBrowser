# 跨模块衔接清单

> **最后更新：** 2026-07-05  
> **交付基线：** [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md) — 以下衔接缺口均须在标准可交付前关闭。  
> **用途：** 唯一存放「模块 A 输出 → 模块 B 输入」对接说明的地方。各模块文档 §7 仅链接到本节锚点。

---

## 总览表

| 衔接点 | 上游 | 下游 | 当前状态 | 待办 ID |
|--------|------|------|----------|---------|
| [Auth→Cloud](#auth-cloud) | [02 登录](modules/02-auth-login.md) | [05 云同步](modules/05-profile-cloud-sync.md) | ✅ dev：bridge 带登录 Bearer | 5.7–5.8 UI |
| [RBAC→Profile](#rbac-profile) | [03 权限](modules/03-rbac-permissions.md) | [05 云同步](modules/05-profile-cloud-sync.md) | ✅ tenant 目录 + env 归属 403 | — |
| [RBAC→EnvList](#rbac-envlist) | [03 权限](modules/03-rbac-permissions.md) | [00 Bridge](modules/00-native-bridge.md) | ✅ `/api/environments` + native.js 同步 | 0.6 生产 |
| [CRX→Launch](#crx-launch) | [04 插件](modules/04-crx-extensions.md) | [00 Bridge](modules/00-native-bridge.md) | 未 load-extension | 4.6 |
| [Auth→Bridge](#auth-bridge) | [02 登录](modules/02-auth-login.md) | [00 Bridge](modules/00-native-bridge.md) | cloud 用 Bearer；bridge 本身仍开放 | 0.4, 0.1 |
| [Users→RBAC UI](#users-rbac-ui) | [02 登录](modules/02-auth-login.md) | [03 权限](modules/03-rbac-permissions.md) | ✅ `/system/users` + `/api/users` | — |
| [Envs→Backend](#envs-backend) | [03 权限](modules/03-rbac-permissions.md) | [00 Bridge](modules/00-native-bridge.md) | ✅ backend 权威 + bridge 同步 | 0.6 生产 |
| [Deploy→All](#deploy-all) | [06 部署](modules/06-deployment.md) | 全部 | 生产未文档化 | 6.1–6.9 |

---

## Auth→Cloud {#auth-cloud}

**目标：** 用户登录后，云快照 pull/upload 自动使用同一 Bearer token，无需单独设置环境变量。

### 当前调用链

```
用户登录 (server 9527)
  → POST /dev-api/auth/login → server-backend:3001
  → token 存 cookie (utils/auth.js)

launchBrowser (native-bridge.js)
  → Authorization: Bearer <登录 token>（dev-native-bridge 请求头）
  → getCloudToken(req) 优先登录 token，其次 CLOUD_API_TOKEN
  → cloudSync.uploadSnapshot / downloadSnapshot
```

### 目标调用链

```
用户登录 → token 存 cookie
  → bridge 启动时从共享位置读取 token（方案待定）：
     A) 前端 launch 前 POST /dev-native-bridge setCloudToken
     B) bridge 读 server-backend session（需 bridge 能访问 cookie）
     C) 生产：backend 代理 native + 注入 user context
```

### 数据格式

- Header：`Authorization: Bearer <hex token>`（与 [`02-auth-login`](modules/02-auth-login.md) 一致）
- 失败降级：无 token 时 **跳过** cloud pull/upload，本地 `packProfile` 仍执行

### 待办

| ID | 任务 | 负责模块 |
|----|------|----------|
| 2.7 | 定义 token 传递机制并实现 | 02 + 00 |
| 5.9 | cloud-sync 改用自动 token | 05 |

---

## RBAC→Profile {#rbac-profile}

**目标：** 用户 A 不能下载/覆盖用户 B 的环境快照。

### 当前状态

- 存储路径：`server-backend/data/profiles/{tenantId}/{envId}/`（**新写入**）；legacy `{envId}/` 仍可读
- 鉴权：`assertCanAccess` — admin 见 tenant 全部 env；非 admin 仅 `ownerId === user.id`；否则 **403**

### 目标状态

```
data/profiles/{tenantId}/{envId}/snapshot.zip
GET /api/profiles/:envId/snapshot  → 校验 req.user 对该 env 有权限
```

### 前置依赖

- [3.5 RBAC→EnvList](#rbac-envlist)：`browser-list.json` 含 `ownerId` / `tenantId`

### 待办

| ID | 任务 | 状态 |
|----|------|------|
| 3.8 | 快照 API 按 tenant 分目录 | ✅ |
| 3.14 | 访问 `:envId` 前校验 env 归属 | ✅ |
| 3.5 | 环境元数据归属 | ✅ |

---

## RBAC→EnvList {#rbac-envlist}

**目标：** 登录用户只能看到、操作自己有权限的指纹环境。

### 当前状态

- 登录后 `getBrowserList()` → `GET /api/environments`（按用户过滤）→ `setBrowserList` 同步 bridge
- admin 首次空库时自动 `POST /api/environments/import` 导入 legacy `browser-list.json`
- 登出 `clearBrowserListCache()` 清空 localStorage + bridge，避免串号
- dev-native-bridge 直连 `getBrowserList` 仍读磁盘（生产见 0.6）

### 目标状态

```
browser-list.users[].ownerId
browser-list.users[].tenantId
getBrowserList → 后端或 bridge 按 req.user 过滤
```

### 与云同步关系

- 环境 ID 在云上与本地一致，但 **快照归属** 须与 `ownerId` 对齐（见 [RBAC→Profile](#rbac-profile)）

### 待办

| ID | 任务 |
|----|------|
| 3.5 | 字段 + 过滤逻辑 |
| 3.6 | ER 文档 |

---

## CRX→Launch {#crx-launch}

**目标：** 启动环境时加载该环境绑定的已启用插件。

### 当前状态

- CRX 元数据：`User Data/crx-list.json` + `Extensions/`
- `getCrxEnvironments(crxId)` / `updateCrxEnvironments` 已实现
- `launchBrowser` spawn 参数：**仅** `--worker-id` + `--user-data-dir`

### 目标状态

```javascript
spawn(innerExe, [
  `--worker-id=${id}`,
  `--user-data-dir=${workerDir}`,
  `--load-extension=${path1},${path2}`  // 或内核等价参数
])
```

### 前置

- [4.7](modules/04-crx-extensions.md#47)：`virtual.dat` / 环境表单写入插件 ID 列表

### 待办

| ID | 任务 |
|----|------|
| 4.7 | 环境表单绑定插件 |
| 4.6 | launchBrowser 注入 |

---

## Auth→Bridge {#auth-bridge}

**目标：** dev-native-bridge 不应对未登录请求暴露敏感 native 操作（生产尤其重要）。

### 当前状态

- `POST /dev-native-bridge` **无鉴权**
- 开发模式 localhost 可任意调用 `launchBrowser`、`deleteBrowser`、上传 CRX

### 目标状态（生产）

```
Nginx / backend 代理
  → 校验 JWT
  → 转发至 native 代理（等价 dev-native-bridge）
```

### 待办

| ID | 任务 |
|----|------|
| 3.4 | backend middleware 覆盖全部 API |
| 0.1 | 生产 native 代理方案（见 [06-deployment](modules/06-deployment.md)） |
| 0.3 | 可选审计日志（envId + user + action） |

---

## Users→RBAC UI {#users-rbac-ui}

**目标：** admin 在 UI 管理用户与角色，与登录、路由权限同一套 `roles`。

### 当前状态（S1 已完成）

- Nest `GET/POST/PUT/DELETE /api/users` + `RolesGuard('admin')`
- 前端 `/system/users`（`asyncRoutes` 仅 admin）
- 用户持久化：SQLite（local）/ Mongo（生产）；bcrypt

### 目标状态

```
admin → /system/users → POST /api/users { roles: ['operator'] }
新用户登录 → getInfo.roles → permission.js 过滤路由
```

**验收：** admin 新建 operator → 新账号登录侧栏无「系统管理」。

---

## Envs→Backend {#envs-backend}

**目标：** 环境列表权威数据源在 `server-backend`，native-bridge 按当前用户读写。

### 当前状态

- `%LOCALAPPDATA%.../browser-list.json` 全局一份；与登录用户无关

### 目标状态

```
GET /api/environments → 仅返回 ownerId=当前用户 或 同 tenant
setBrowserList / launchBrowser → bridge 带 user context 或先调 backend
```

### 待办

| ID | 模块 |
|----|------|
| 3.13, 3.5 | 环境 API + 归属字段 |
| 0.6 | bridge 与 backend 列表一致 |

---

## Deploy→All {#deploy-all}

**目标：** 生产环境三套组件协同运行，文档化交付物与配置。

### 组件

| 组件 | dev | 生产（待定） |
|------|-----|--------------|
| 管理 UI | webpack devServer :9527 | `server/dist` 静态托管 |
| 业务 API | server-backend :3001 | 同左或独立部署 |
| Native | dev-native-bridge | backend 代理或 sidecar |
| 内核 | Chrome-bin/146.x | 同左，随交付包 |

### 待办

见 [06-deployment](modules/06-deployment.md) §5（6.1–6.9）。

---

## 失败降级原则（标准可交付后）

| 场景 | 行为 |
|------|------|
| 未登录 | 跳转登录；**禁止**业务 API 与敏感 native 操作 |
| 云 API 404（无快照） | pull 跳过；启动本地 Workers |
| 登录过期 | 前端跳转登录；云同步 skip |
| CRX 未绑定 | launchBrowser 不加载扩展 |
| 非 admin 访问 `/system/users` | 403 / 重定向 |

---

## 验收：标准可交付衔接检查表

见 [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md)。核心演示：

- [x] admin 在 `/system/users` 创建 operator → 新账号权限正确  
- [ ] operator 仅见自己的环境；他人 env 快照 **403**  
- [x] 登录后云同步 **无需** 手动 `CLOUD_API_TOKEN`（dev）  
- [ ] 环境绑定 CRX → 启动后扩展可见  
- [ ] A 机 Cookie → B 机同 tenant 用户恢复登录态  
- [ ] 生产部署文档可重复安装
