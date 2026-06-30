# VirtualBrowser 二开 — 项目进度与 Agent 交接文档

> **最后更新：** 2026-06-27  
> **读者：** 接续本项目的 Agent / 开发者  
> **状态：** 路线 B 已落地，dev 环境可创建并启动指纹环境 ✅

---

## 1. 一句话现状

用户在 **浏览器 localhost 二开 `server/` 管理界面**，通过 **dev-native-bridge** 调用 **内层 Chromium 指纹内核** 真实启动环境；**已删除原厂 Electron 外层壳**，不再依赖 `npm run app` / `app.asar`。

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
│  开源 server/（Vue 2 + Element UI + vue-element-admin）       │
│  热更新二开 UI / 权限框架                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │  dev 模式无 chrome.send
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  dev-native-bridge（Node，挂在 webpack devServer）           │
│  POST /dev-native-bridge  { name, params }                   │
│  文件：server/mock/native-bridge.js                          │
└───────────────────────────┬─────────────────────────────────┘
                            │  spawn + 读写用户数据
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Chrome-bin/VirtualBrowser/146.0.7680.72/  （内层指纹内核）   │
│  VirtualBrowser.exe + chrome.dll + worker/                   │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
  %LOCALAPPDATA%\VirtualBrowser\Workers\{id}\   （环境数据）
  %LOCALAPPDATA%\VirtualBrowser\User Data\     （全局配置）
```

### 已删除 / 不再使用

| 项 | 说明 |
|----|------|
| `Chrome-bin/VirtualBrowser.exe`（外层） | 原厂 Electron 管理壳 |
| `Chrome-bin/resources/app.asar` | 原厂打包 UI，**勿再 deploy** |
| `npm run app` / `deploy:ui` / `restore:app` | 脚本已删 |
| `localhost` 直接调 `chrome.send` | 普通浏览器无此 API |
| 纯 mock 假数据方案 | 用户明确不要；已改为 dev-native-bridge |

### 保留

| 项 | 路径 |
|----|------|
| 内层指纹内核 | `Chrome-bin/VirtualBrowser/146.0.7680.72/` |
| 开源管理端源码 | `server/` |
| 新标签页源码 | `worker/` |
| 自动化示例 | `automation/` |
| 路径配置 | `config/chrome-bin.paths.json` |

---

## 4. 仓库目录速查

```
VirtualBrowser/
├── PROJECT_PROGRESS.md     ← 本文件（Agent 首读）
├── MISSION.md              ← 学习目标
├── NOTES.md                ← 用户偏好与备忘
├── RESOURCES.md            ← 外部参考链接
├── config/
│   ├── chrome-bin.paths.json   ← 内核路径（单一真相源）
│   └── PATHS.md
├── Chrome-bin/             ← 仅内层内核（路线 B）
│   ├── README.md
│   └── VirtualBrowser/146.0.7680.72/
├── server/                 ← 管理控制台（二开主战场）
│   ├── src/api/native.js           ← native 入口
│   ├── src/api/native-bridge-client.js
│   ├── mock/native-bridge.js       ← dev 桥接实现
│   └── scripts/prune-outer-shell.ps1 ← 清理外层（已执行）
├── worker/                 ← 指纹新标签页
│   └── scripts/deploy-worker.ps1
├── automation/             ← Playwright 示例
├── lessons/                ← teach skill 课程 HTML
└── learning-records/       ← 学习记录
```

---

## 5. 日常开发命令（已验证）

### 管理端二开 + 创建/启动环境

```powershell
cd D:\bytesio\VirtualBrowser\server
npm install          # 首次
npm run dev          # → http://localhost:9527
```

- 页面会提示「二开 dev 模式」
- 创建/启动走 dev-native-bridge，**可真实弹出指纹窗口**
- **不要**用原厂 VirtualBrowser.exe 管理壳（已删）

### 部署 worker 新标签页到内核

```powershell
cd D:\bytesio\VirtualBrowser\worker
npm run build
npm run deploy:worker
# 写入 Chrome-bin/VirtualBrowser/146.x/worker/
```

### Playwright 自动化（指向内层 exe）

见 `automation/index.js`：

```javascript
executablePath: 'D:\\bytesio\\VirtualBrowser\\Chrome-bin\\VirtualBrowser\\146.0.7680.72\\VirtualBrowser.exe'
userData: %LOCALAPPDATA%\VirtualBrowser\Workers\{workerId}
```

### Node 环境

- 用户通过 **nvm** 安装，当前使用 **Node 20.x**
- nvm 路径示例：`D:\nvm`，symlink `C:\nvm4w\nodejs`

---

## 6. Native 通信机制（必读）

### 生产 / 原厂壳（本项目已不用）

```javascript
// server/src/api/native.js
chrome.send(name, args)  // 仅 Electron WebUI 注入时存在
```

### 当前 dev 二开路径

```javascript
// native.js 逻辑：
if (process.env.NODE_ENV === 'development' && !chrome.send) {
  → fetch('/dev-native-bridge') → native-bridge.js
}
```

### dev-native-bridge 已实现的方法

| 方法 | 行为 |
|------|------|
| `getBrowserList` / `setBrowserList` | 读写 `%LOCALAPPDATA%\VirtualBrowser\User Data\browser-list.json`，同步 `Workers/{id}/virtual.dat` |
| `launchBrowser` | `spawn` 内层 `VirtualBrowser.exe --worker-id=N --user-data-dir=...` |
| `getRuningBrowser` | 跟踪 bridge 内子进程 |
| `deleteBrowser` | 杀进程 |
| `getGlobalData` / `setGlobalData` | `User Data/global.dat` |
| `getBrowserVersion` | 返回 `146.0.7680.72` |
| `checkProxy` | 未实现，返回 false |

### 客户端仍用 localStorage

`native.js` 中 `addBrowser` 等仍会写 `localStorage`（`list`、`group`），再经 bridge 持久化到磁盘。改存储策略时需两边一起看。

---

## 7. 权限与登录（待做 — 下一 Agent 重点）

| 模块 | 现状 | 二开方向 |
|------|------|----------|
| 登录 | `server/src/api/user.js` → mock `/vue-element-admin/user/*` | 替换为真实 Auth API |
| 路由权限 | `server/src/permission.js` + vue-element-admin 框架 | `asyncRoutes` 几乎为空，需绑业务页 |
| 按钮权限 | `v-permission` 指令已有 | 按角色隐藏创建/删除/启动 |
| 环境资产 | 全员可见（localStorage + 本地文件） | 后端按 tenant/user 过滤环境 ID |
| native 层 | dev-bridge 本地文件 | 未来可加业务 API 鉴权后再调 bridge |

**三层权限目标：**

1. **UI 层** — 路由 / 按钮（`permission.js`、`meta.roles`）
2. **业务 API 层** — 自研后端（用户、角色、环境归属）
3. **Native 层** — 可选审计；内核本身不开源

---

## 8. 已完成 vs 待办

### ✅ 已完成

- [x] 理清内外层架构（外层 Electron vs 内层 Chromium）
- [x] 路线 B：删除外层原厂壳，保留 `146.0.7680.72` 内核
- [x] `dev-native-bridge` 实现，浏览器内可创建/启动（用户确认可启动）
- [x] `config/chrome-bin.paths.json` 统一路径
- [x] worker 部署脚本 `deploy:worker`
- [x] automation 路径指向内层 exe
- [x] teach workspace：`MISSION.md`、`lessons/`、`learning-records/`

### 🔲 下一阶段总任务（2026-06-27 规划）

四大主线：**私有化部署 → 账号登录 → 权限设计 → 插件管理修复**。建议按 Phase 顺序推进，Phase 1/2 可并行。

---

#### Phase 1 — 私有化部署（品牌与交付）

| # | 任务 | 重点 / 验收 | 涉及文件 |
|---|------|-------------|----------|
| 1.1 | 品牌替换 | 产品名、Logo、Favicon、登录页文案脱离 Virtual Browser | `settings.js`、`lang/zh.js`、`layout/components/Sidebar/Logo.vue`、`login/index.vue` |
| 1.2 | 主题与样式 | 主色、侧边栏、去掉 vue-element-admin 默认痕迹 | `styles/variables.scss`、`layout/` |
| 1.3 | 环境变量与构建 | 区分 dev / staging / prod API 基址 | `.env.development`、`.env.production`、`vue.config.js` |
| 1.4 | 生产部署文档 | 路线 B 交付物：**自研后端 + `npm run build:prod` 静态资源 + 内层内核** | 新建 `docs/DEPLOY.md` |
| 1.5 | 静态资源托管 | Express/Nginx 托管 `dist/`，API 反向代理，**不恢复 app.asar** | 自研 `server-backend/` 或独立服务 |

**归纳重点：** 私有化首先是「看得见」的品牌与「可重复」的部署流程；native 仍走 dev-bridge（开发）或自研后端代理（生产）。

---

#### Phase 2 — 账号登录（替换 mock）

| # | 任务 | 重点 / 验收 | 涉及文件 |
|---|------|-------------|----------|
| 2.1 | 定 Auth API 契约 | `POST /auth/login`、`GET /auth/me`、`POST /auth/logout`；JWT 或 Session | 新建后端模块 |
| 2.2 | 替换 mock 接口 | 去掉 `/vue-element-admin/user/*` 依赖 | `api/user.js`、`mock/user.js` |
| 2.3 | Token 存储 | 沿用 cookie + `utils/auth.js`，对接真实 token 生命周期 | `utils/auth.js`、`utils/request.js` |
| 2.4 | 用户表 MVP | 用户名、密码哈希、角色、租户 ID；SQLite/PostgreSQL 任选 | 后端 DB |
| 2.5 | 登录页改造 | 去掉 demo 账号提示；错误信息中文化 | `views/login/index.vue` |

**现状：** mock 仅支持 `admin` / `editor` 固定 token（`mock/user.js`），无真实密码校验。

**归纳重点：** 登录是权限与多租户的前置条件；先 MVP（单租户 + 多用户），再扩展注册/找回密码。

---

#### Phase 3 — 权限设计（RBAC MVP）

| # | 任务 | 重点 / 验收 | 涉及文件 |
|---|------|-------------|----------|
| 3.1 | 角色枚举 | 建议：`admin`（全权限）、`operator`（创建/启动/编辑）、`viewer`（只读） | 后端 + `store/modules/user.js` |
| 3.2 | 路由级权限 | 将 `/crx`、分组管理等移入 `asyncRoutes`，加 `meta.roles` | `router/index.js`、`permission.js` |
| 3.3 | 按钮级权限 | 创建/删除/启动/导入环境用 `v-permission` | `views/browser/index.vue` |
| 3.4 | API 鉴权 | 后端校验 JWT + 角色；native-bridge 仅在内网/已鉴权后暴露 | 后端 middleware |
| 3.5 | 环境资产隔离 | `browser-list.json` 增加 `ownerId` / `tenantId`；列表 API 按用户过滤 | `native-bridge.js`、`native.js`、后端 |
| 3.6 | 权限数据模型 | User ↔ Role ↔ Permission；环境 ↔ User 归属 | ER 设计文档 |

**现状：** `permission.js` 框架完整，但 `asyncRoutes` 几乎为空，业务页全在 `constantRoutes`（登录即全员可见）。

**三层权限目标（不变）：**

1. **UI 层** — 路由 / 按钮（`permission.js`、`meta.roles`、`v-permission`）
2. **业务 API 层** — 用户、角色、环境归属
3. **Native 层** — bridge 调用前鉴权（可选审计）

**归纳重点：** 先做「谁能启动/删环境」比做完整 RBAC 后台更重要；环境隔离是私有化交付的核心差异点。

---

#### Phase 4 — 插件管理修复（当前最大功能缺口）

| # | 任务 | 重点 / 验收 | 涉及文件 |
|---|------|-------------|----------|
| 4.1 | **根因确认** ✅ | 路由已注册，但 **`store.vue` / `list.vue` 均为空文件**；官方 GitHub 同样为空（功能在闭源 Electron 壳） | `views/crx/*.vue` |
| 4.2 | 逆向 native API | 从 `app.asar.extracted` 或运行中原厂壳抓取 `chrome.send` 方法名（如 get/set/upload/delete crx） | Electron dist / DevTools |
| 4.3 | 实现 crx API 层 | 在 `native.js` 封装 + `native-bridge.js` 实现本地 CRX 存储 | `api/native.js`、`mock/native-bridge.js` |
| 4.4 | 插件管理页 | **插件管理**：已安装列表、启用/禁用、删除、上传 .crx | `views/crx/list.vue` |
| 4.5 | 插件市场页 | **插件市场**：浏览/搜索/安装（可先本地 catalog，再接远程源） | `views/crx/store.vue` |
| 4.6 | 与环境绑定 | 环境配置中指定要加载的插件 ID 列表；`launchBrowser` 时注入扩展路径 | `browser/index.vue`、worker 启动参数 |
| 4.7 | 存储约定 | 约定 `%LOCALAPPDATA%\VirtualBrowser\Extensions\` 或 `User Data/crx-list.json` | bridge + 文档 |

**现状诊断：**

- 侧边栏「插件市场 / 插件管理」可点，但页面空白（空 Vue 组件）
- `native.js` / `native-bridge.js` **无任何 crx 相关方法**
- 浏览器环境表单 **未引用** extension 字段
- 闭源壳依赖 `crx3-utils`、`unzip-crx-3`（见 `app.asar.extracted/package.json`），二开需在 bridge 侧重实现

**归纳重点：** 插件管理不是小 bug，而是**开源 server 从未实现的闭源能力**；需「逆向 API + bridge 实现 + 重写两个 Vue 页」三件套。

---

#### 推荐实施顺序（依赖关系）

```
Phase 1（品牌/部署）─────┐
                         ├──→ Phase 2（登录）──→ Phase 3（权限）──→ 环境隔离
Phase 4.1–4.3（插件 API）┘                              │
         └──→ Phase 4.4–4.7（插件 UI + 环境绑定）────────┘
```

| 优先级 | 任务块 | 理由 |
|--------|--------|------|
| P0 | 4.1–4.3 插件 API 调研与 bridge | 用户已可见菜单但功能全空，体验断裂 |
| P0 | 2.1–2.3 真实登录 | 权限与环境隔离的前置 |
| P1 | 3.1–3.3 路由/按钮权限 MVP | 快速体现私有化价值 |
| P1 | 1.1–1.2 UI 私有化 | 交付演示需要 |
| P2 | 3.5 环境租户隔离 | 依赖登录 + 后端 |
| P2 | 4.4–4.7 插件完整功能 | 依赖 4.2–4.3 |
| P3 | 1.4–1.5 生产部署文档与托管 | 上线前补齐 |

---

## 9. 常见坑（Agent 勿重蹈）

| 现象 | 原因 | 正确做法 |
|------|------|----------|
| `chrome.send is not a function` | 在 localhost 且无 bridge | 必须 `npm run dev`（含 bridge），不是普通静态服务器 |
| 栈里显示 `native.js:31` | webpack dev source map | 说明在浏览器 dev 模式，正常 |
| 让用户 `npm run app` | 外层壳已删 | 只用 `npm run dev` |
| 用 Google Chrome 替代内核 | 无指纹能力 | 必须保留 `146.x` 内层 |
| `deploy:ui` 写 app.asar | 路线 B 无 app.asar | 改 UI 在 dev 热更新；生产另定方案 |
| 删 `Chrome-bin/VirtualBrowser/146.x` | 误删内核 | 整个产品无法启动指纹环境 |

---

## 10. 关键文件索引

| 文件 | 作用 |
|------|------|
| `server/src/api/native.js` | 所有环境 CRUD / 启动的 frontend 入口 |
| `server/mock/native-bridge.js` | dev 环境 Node 侧 native 实现 |
| `server/mock/mock-server.js` | 注册 bridge + mock 登录 API |
| `server/src/permission.js` | 路由守卫 |
| `server/src/router/index.js` | 路由表；浏览器页在 `/index` |
| `server/src/views/browser/index.vue` | 环境列表主 UI（2000+ 行） |
| `server/vue.config.js` | devServer 9527；`open: false` |
| `worker/src/App.vue` | 指纹新标签页 |
| `automation/index.js` | Playwright 示例 |

---

## 11. 相关文档

| 文档 | 用途 |
|------|------|
| [`MISSION.md`](./MISSION.md) | 用户长期目标 |
| [`NOTES.md`](./NOTES.md) | 用户偏好、简短备忘 |
| [`RESOURCES.md`](./RESOURCES.md) | vue-element-admin、VirtualBrowser 官方链接 |
| [`config/PATHS.md`](./config/PATHS.md) | 路径与命令 |
| [`Chrome-bin/README.md`](./Chrome-bin/README.md) | 内核目录说明 |
| [`lessons/0001-architecture-and-privatization-roadmap.html`](./lessons/0001-architecture-and-privatization-roadmap.html) | 架构课（部分内容已被路线 B  supersede） |

---

## 12. Agent 接续检查清单

开始工作前请确认：

1. `Test-Path Chrome-bin/VirtualBrowser/146.0.7680.72/VirtualBrowser.exe` → 应为 True  
2. `cd server && npm run dev` 可起，访问 9527 有「二开 dev 模式」提示  
3. 创建环境 + 启动能弹出指纹窗口  
4. 用户要 **中文** 回复  
5. **不要** 恢复 mock-only 或外层 app.asar 流程，除非用户明确要求  
6. 改 native 行为优先改 `native-bridge.js`（dev）和 `native.js`（共用逻辑）

---

## 13. 版本信息

| 项 | 值 |
|----|-----|
| 内核版本 | 146.0.7680.72 |
| server | Vue 2.6 + Element UI 2.13（vue-element-admin 模板） |
| worker | Vue 3 + Element Plus |
| OS | Windows 10 |
| 工作区 | `D:\bytesio\VirtualBrowser` |
