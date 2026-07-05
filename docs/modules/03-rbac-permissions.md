# 模块 03 — 权限设计（RBAC 标准可交付）

> **状态：** 🟢 S2 环境 API + 快照归属校验已完成；bridge 侧过滤随前端 sync 生效  
> **交付基线：** [DELIVERY_STANDARD.md](../DELIVERY_STANDARD.md)  
> **最后更新：** 2026-07-04

## 1. 目标与边界

**标准可交付 = 前后端配合的三层 RBAC，不是「登录 + 藏按钮」。**

| 层 | 标准可交付要求 | 当前 |
|----|----------------|------|
| **UI** | 动态路由 + `v-permission` | ✅ 基本完成 |
| **API** | 每个接口验 token + 角色 + **资源归属** | ✅ environments + profiles 403 |
| **数据** | 环境/快照/插件按 `ownerId`/`tenantId` 隔离 | ✅ 环境 + 快照（CRX 待 S5） |

**负责：**

- 固定三角色：`admin` / `operator` / `viewer`（角色定义在 backend，不在前端写死业务规则）
- 路由与按钮权限（与 [02](02-auth-login.md) 登录返回的 `roles` 一致）
- **系统管理** 菜单：用户管理（实现于 02.11，路由权限在本模块）
- 环境资产归属；快照 tenant 隔离
- **`server-backend` 统一鉴权**（所有业务 API）

**不负责：**

- 用户表 CRUD 实现细节（见 [02-auth-login](02-auth-login.md)）
- Chromium 内核权限

---

## 2. 架构与数据流（标准可交付）

```mermaid
flowchart TB
  subgraph frontend [server]
    Login[登录]
    SysUI["/system/users admin only"]
    BizUI[业务页 v-permission]
    Guard[permission.js]
  end

  subgraph backend [server-backend]
    AuthMW[authMiddleware]
    UsersAPI[/api/users]
    EnvsAPI["/api/environments 或代理"]
    ProfileAPI[/api/profiles]
    DB[(users + env_metadata)]
  end

  subgraph bridge [native-bridge]
    Native[getBrowserList 过滤]
  end

  Login --> AuthMW
  SysUI --> UsersAPI
  BizUI --> EnvsAPI
  Guard --> BizUI
  EnvsAPI --> DB
  EnvsAPI --> Native
  ProfileAPI --> AuthMW
  UsersAPI --> AuthMW
```

**角色能力矩阵（产品基线，operator 细节见 3.7）：**

| 能力 | admin | operator | viewer |
|------|-------|----------|--------|
| 系统管理 → 用户 | ✓ | ✗ | ✗ |
| 浏览器列表 | ✓ | ✓ | ✓（仅自己的环境） |
| 分组 / CRX | ✓ | ✓ | ✗ |
| 新建/编辑环境 | ✓ | ✓ | ✗ |
| 删除环境 | ✓ | ✗ | ✗ |
| 云同步手动触发 | ✓ | ✓ | ✗ |

---

## 3. 关键文件索引

| 路径 | 职责 |
|------|------|
| [`server/src/permission.js`](../../server/src/permission.js) | 路由守卫 |
| [`server/src/router/index.js`](../../server/src/router/index.js) | `asyncRoutes`；**待增** `/system` |
| [`server/src/store/modules/permission.js`](../../server/src/store/modules/permission.js) | 动态路由 |
| [`server/src/directive/permission`](../../server/src/directive/permission) | `v-permission` |
| [`server/src/views/browser/index.vue`](../../server/src/views/browser/index.vue) | 环境页按钮 |
| [`server-backend/src/common/roles.guard.ts`](../../server-backend/src/common/roles.guard.ts) | `RolesGuard` + `@Roles('admin')` |
| `server-backend/src/environments/` | 环境 CRUD API + 归属过滤 |

---

### 3.6 数据模型（ER 摘要）

```
users (id, username, tenant_id, roles, ...)
  │ 1:N owner
  ▼
environments (tenant_id + env_id, owner_id, name, group, payload JSON)
  │ 1:1 snapshot per tenant
  ▼
profiles/{tenantId}/{envId}/snapshot.zip + meta.json
```

- **admin**：`findByTenant(tenantId)` 见本租户全部环境  
- **operator / viewer**：`findByOwner(user.id)` 仅见自己的环境  
- 快照 API 先 `assertCanAccess(user, envId)` 再读写磁盘

---

## 4. 已完成清单

- [x] **3.1** 角色枚举 — admin / operator / viewer
- [x] **3.2** 路由级 — `/group`、`/crx` → `asyncRoutes`
- [x] **3.3** 按钮级 — browser 页 `v-permission`
- [x] **3.4** backend 业务 API AuthGuard（profiles + users）
- [x] **3.10** `RolesGuard` + `@Roles('admin')` 用于 `/api/users`
- [x] **3.11** `/system/users` 路由（admin only）
- [x] **3.5** 环境归属 — `ownerId`/`tenantId`；admin 见 tenant 全部，operator/viewer 仅自己的
- [x] **3.8** 快照 tenant 隔离 + **3.14** env 归属 403
- [x] **3.13** `GET/POST/PUT/DELETE /api/environments` + `POST /import`
- [x] **3.6** ER 摘要（见 §3.6）

---

## 6. 手动验证步骤

**当前（UI MVP）：** admin vs viewer 侧栏/按钮差异（见旧 §6）。

**标准可交付完成后：**

1. admin 在 `/system/users` 创建 tenant A 的 operator  
2. operator 登录仅见 **自己的** 环境列表  
3. operator 调用他人 `envId` 的快照 API → **403**  
4. viewer 无法访问 `/system/users`（路由 + 直接 URL 均 401/404）

---

## 7. 关联模块

- **上游：** [02-auth-login](02-auth-login.md)（用户、token、tenantId、管理 UI 后端）
- **下游：** [00-native-bridge](00-native-bridge.md)、[05-profile-cloud-sync](05-profile-cloud-sync.md)
- **基线：** [DELIVERY_STANDARD.md](../DELIVERY_STANDARD.md)
- **衔接：** [INTEGRATION.md](../INTEGRATION.md)
