# VirtualBrowser 二开 — 项目进度与 Agent 交接文档

> **最后更新：** 2026-07-04  
> **读者：** 接续本项目的 Agent / 开发者  
> **状态：** 路线 B 已落地；**S1 完成**（DB + 用户管理 UI）；**S2 进行中**（环境/快照隔离）  
> **交付基线：** [`docs/DELIVERY_STANDARD.md`](docs/DELIVERY_STANDARD.md)

**开发清单已拆分至 [`docs/README.md`](docs/README.md)**（按模块独立文档 + [`docs/INTEGRATION.md`](docs/INTEGRATION.md) 衔接说明）。本文档保留架构、命令、常见坑与 Agent 检查清单。

---

## 1. 一句话现状

用户在 **浏览器 localhost 二开 `server/` 管理界面**，通过 **dev-native-bridge** 调用 **内层 Chromium 指纹内核** 真实启动环境；**已删除原厂 Electron 外层壳**。另起 **`server-backend`**（NestJS :3001，本地 SQLite / 生产 Mongo）提供登录、用户管理与 Profile 云快照 API。

---

## 2. Mission（不变）

详见 [`MISSION.md`](./MISSION.md)。

| 目标 | 说明 |
|------|------|
| 私有化交付 | 换 UI / 品牌 / 文案 |
| 账号 + 资产 + 权限 | 用户、角色、浏览器环境（指纹配置）管控 |
| 未来扩展 | 在 native 通信层叠加业务逻辑 |

**不在范围：** 自编译 Chromium、Mac/Linux 客户端、商业化 License。

---

## 3. 架构决策：路线 B（当前唯一方案）

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器  http://localhost:9527                               │
│  开源 server/（Vue 2 + Element UI）                          │
└───────────────────────────┬─────────────────────────────────┘
                            │  /dev-api → server-backend :3001
                            │  /dev-native-bridge
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  dev-native-bridge（server/mock/native-bridge.js）           │
│  profile-sync / cloud-sync / crx-store                       │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Chrome-bin/VirtualBrowser/146.0.7680.72/                    │
└───────────────────────────┬─────────────────────────────────┘
                            ▼
  %LOCALAPPDATA%\VirtualBrowser\Workers\{id}\
  %LOCALAPPDATA%\VirtualBrowser\ProfileSnapshots\{id}\
```

### 已删除 / 不再使用

| 项 | 说明 |
|----|------|
| 外层 `VirtualBrowser.exe` / `app.asar` | 原厂 Electron 壳 |
| `npm run app` / `deploy:ui` | 已删 |
| 纯 mock 环境数据 | 已改为 dev-native-bridge |

---

## 4. 仓库目录速查

```
VirtualBrowser/
├── docs/
│   ├── README.md              ← 本索引
│   ├── INTEGRATION.md         ← 跨模块衔接（唯一）
│   ├── DELIVERY_STANDARD.md   ← 标准可交付验收
│   ├── PROFILE_SYNC.md        ← 重定向至 modules/05
│   └── modules/
│       ├── 00-native-bridge.md … 06-deployment.md
│       └── 07-backend-stack.md  ← Nest + SQLite/Mongo（扩展）
├── PROJECT_PROGRESS.md     ← 架构/命令/常见坑（非任务表）
├── server/                 ← 管理 UI + dev-native-bridge
├── server-backend/         ← Auth + Profile 快照 API
├── worker/                 ← 新标签页
├── Chrome-bin/146.x/       ← 指纹内核
└── config/chrome-bin.paths.json
```

---

## 5. 日常开发命令（已验证）

```powershell
# 终端 1 — 后端（默认 SQLite，无需 Mongo）
cd D:\bytesio\VirtualBrowser\server-backend
npm install
copy .env.example .env
npm run start:dev

# 终端 2 — 前端 + bridge
cd D:\bytesio\VirtualBrowser\server
npm install
npm run dev

# 云同步（临时：需手动 token，见 docs/INTEGRATION.md）
$env:CLOUD_API_BASE = "http://localhost:3001"
$env:CLOUD_API_TOKEN = "<login 返回的 token>"
```

测试账号：`admin/admin123`、`operator/operator123`、`viewer/viewer123`

---

## 6. Native 通信机制（摘要）

dev 路径：`native.js` → `POST /dev-native-bridge` → [`server/mock/native-bridge.js`](server/mock/native-bridge.js)

| 类别 | 已实现方法（详见各模块文档） |
|------|------------------------------|
| 环境 | get/setBrowserList, launchBrowser, deleteBrowser, getRuningBrowser, getGlobalData, setGlobalData |
| Profile | packProfile, unpackProfile, getProfileLocalMeta + launch 云 pull/upload |
| CRX | getLocalCrxList, addLocalCrx, deleteLocalCrx, enableLocalCrx, get/updateCrxEnvironments 等 |
| 其他 | getBrowserVersion；checkProxy **未实现** |

`native.js` 仍写 `localStorage`（list/group），改存储策略时需与磁盘同步一起看。

---

## 7. 模块进度快照

**验收标准：** [`docs/DELIVERY_STANDARD.md`](docs/DELIVERY_STANDARD.md)  
**详细任务：** [`docs/README.md`](docs/README.md)

| 模块 | 状态 | 标准可交付缺口（摘要） |
|------|------|------------------------|
| 00 Native Bridge | 🟡 | 环境 API 与 backend 对齐；生产代理 |
| 01 UI 私有化 | 🟢 | prod env 文档 |
| 02 登录 + 用户管理 | 🟢 | S1 完成；**2.7 token→云同步** 待 S3 |
| 03 权限 | 🟡 | **环境列表过滤、env 归属 403**（S2） |
| 04 CRX | 🟡 | 启动注入、环境绑定 |
| 05 云同步 | 🟡 | 自动 token、同步 UI |
| 06 生产部署 | 🔴 | 全套交付文档与托管 |
| 07 后端栈 | 🟢 | Nest + SQLite/Mongo 双模式 |

**当前优先（S2）：** 3.5、3.13、3.14 — 环境归属 + `/api/environments` + 快照 per-env 鉴权。

**Phase 5（Profile 云同步）：** 本地 pack + backend 快照 API 已通；待 S3 自动 token、S4 同步 UI — 见 [`docs/modules/05-profile-cloud-sync.md`](docs/modules/05-profile-cloud-sync.md)。

---

## 8. 常见坑（Agent 勿重蹈）

| 现象 | 原因 | 正确做法 |
|------|------|----------|
| `chrome.send is not a function` | 无 bridge | 必须 `npm run dev` |
| 让用户 `npm run app` | 外层壳已删 | 只用 `npm run dev` |
| 用 Google Chrome 替代内核 | 无指纹 | 保留 `146.x` 内层 |
| 云同步不工作 | 未设 token | 设 `CLOUD_API_TOKEN` 或完成 2.7/5.9 |
| 删 `Chrome-bin/.../146.x` | 误删内核 | 无法启动指纹环境 |

---

## 9. 关键文件索引

| 文件 | 作用 |
|------|------|
| `server/mock/native-bridge.js` | dev native 实现 |
| `server/src/api/native.js` | 前端 native 入口 |
| `server/lib/profile-sync.js` | Cookie/缓存打包 |
| `server/lib/cloud-sync.js` | 云快照客户端 |
| `server/lib/crx-store.js` | 插件存储 |
| `server-backend/src/main.ts` | Nest 入口；Auth + Users + Profiles |
| `server-backend/src/storage/` | SQLite / Mongo 双模式 |
| `server/src/permission.js` | 路由守卫 |

---

## 10. 相关文档

| 文档 | 用途 |
|------|------|
| **[`DELIVERY_STANDARD.md`](DELIVERY_STANDARD.md)** | **标准可交付验收基线** |
| **[`docs/README.md`](docs/README.md)** | **模块开发清单总索引** |
| [`docs/INTEGRATION.md`](docs/INTEGRATION.md) | 跨模块衔接 |
| [`MISSION.md`](./MISSION.md) | 长期目标 |
| [`NOTES.md`](./NOTES.md) | 用户偏好 |
| [`config/PATHS.md`](./config/PATHS.md) | 路径与命令 |

---

## 11. Agent 接续检查清单

1. `Test-Path Chrome-bin/VirtualBrowser/146.0.7680.72/VirtualBrowser.exe` → True  
2. `server-backend` + `server npm run dev` 可起  
3. admin 登录成功；创建环境 + 启动弹出指纹窗口  
4. 查任务进 **`docs/modules/`**，改衔接先读 **`docs/INTEGRATION.md`**  
5. 用户要 **中文** 回复  
6. **不要** 恢复 app.asar / mock-only，除非用户明确要求  

---

## 12. 版本信息

| 项 | 值 |
|----|-----|
| 内核版本 | 146.0.7680.72 |
| server | Vue 2.6 + Element UI 2.13 |
| server-backend | NestJS 10 + SQLite/Mongo |
| OS | Windows 10 |
| 工作区 | `D:\bytesio\VirtualBrowser` |
