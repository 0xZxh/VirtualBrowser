# VirtualBrowser 二开 — 项目进度与 Agent 交接文档

> **最后更新：** 2026-07-15  
> **读者：** 接续本项目的 Agent / 开发者  
> **状态：** **S1–S4 ✅**；**S5 ✅ 基本通过**（扩展目视待用户）；**S6 🟢 mongo HTTP 通过 / HTTPS 待运维**；**S7 🟡 Setup.exe 已产出 / 实机与生产 API 待验**；**S8 🟢 第一期+第二期 API-01..19 完成**（Cookie 第三期未做）；**跨平台预备 ✅**（路径抽象 + UA 伪装；内核仍 Windows-only）  
> **交付基线：** [`docs/DELIVERY_STANDARD.md`](docs/DELIVERY_STANDARD.md)  
> **阶段验收真相：** [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)（**以本表为准，勿信旧对话**）  
> **Multitask 协调：** [`docs/AGENT_COORDINATION.md`](docs/AGENT_COORDINATION.md)（**开工先读**）

**开发清单：** [`docs/README.md`](docs/README.md) · 跨模块衔接 [`docs/INTEGRATION.md`](docs/INTEGRATION.md)

---

## 1. 一句话现状

**开发态可用：** `localhost:9527` + dev-native-bridge + Chromium 146.x；`server-backend`（:3001 SQLite 或 mongo、:9000 Compat）提供登录、权限、云快照与自动化 API。

**客户交付进展：**

| 产物 | 状态 |
|------|------|
| `packaging/output/VirtualBrowser-Setup-0.1.0.exe` | ✅ 已构建（约 464MB；`CloudApiBase` 暂为 `http://127.0.0.1:3001`） |
| 云端 Mongo + HTTP API | ✅ 本机 `STORAGE_DRIVER=mongo` 验收通过 |
| 生产 HTTPS 域名 | ⬜ 待运维 / CLOUD_DEPLOY |
| Setup 实机：安装 → 窗口 → 登录 → 启动指纹 | ⬜ 待用户 / E2E-2 |

已删除原厂 Electron `app.asar`；使用新建 `desktop-shell/`，禁止恢复原厂闭源壳。

---

## 2. Mission（不变）

详见 [`MISSION.md`](./MISSION.md)。私有化交付、账号权限、Compat 自动化；不做 Chromium 自编译、Mac/Linux、License 计费。

---

## 3. 三轨架构（摘要）

| 轨 | 入口 | 状态 |
|----|------|------|
| **A 管理 UI** | dev `:9527` 或桌面壳 | 功能 S1–S5 基本可用 |
| **B 云端 S6** | `server-backend` Mongo/HTTPS | mongo HTTP ✅；HTTPS ⬜ |
| **C Compat S8** | `:9000` + api-key | API-01–19 ✅；Cookie 第三期 pending |

**共享层：** [`server/lib/native-runtime.js`](server/lib/native-runtime.js)（INFRA-A ✅）

---

## 4. 仓库目录速查

```
VirtualBrowser/
├── docs/ AGENT_COORDINATION · ACCEPTANCE · COMPAT_API · CLOUD_DEPLOY · acceptance-reports/
├── desktop-shell/          ← S7 Electron 壳 ✅
├── packaging/              ← staging + output/VirtualBrowser-Setup-0.1.0.exe ✅
├── server/                 ← Vue 管理 UI + dev-native-bridge
├── server-backend/         ← Nest :3001 + Compat :9000
├── worker/ · Chrome-bin/146.x/
└── PROJECT_PROGRESS.md
```

---

## 5. 日常开发命令

```powershell
cd D:\bytesio\VirtualBrowser\server-backend
npm run start:dev

cd D:\bytesio\VirtualBrowser\server
npm run dev   # http://localhost:9527
```

测试账号：`admin/admin123`、`operator/operator123`、`viewer/viewer123`  
云同步：登录 UI 即可（无需 `CLOUD_API_TOKEN`）。

**构建客户端安装包：**

```powershell
$env:Path = "D:\NSIS;" + $env:Path   # 若 makensis 不在 PATH
cd D:\bytesio\VirtualBrowser\packaging\scripts
.\build-client.ps1 -CloudApiBase "https://你的生产API域名"
# 产物：packaging\output\VirtualBrowser-Setup-0.1.0.exe
```

---

## 6. Native / Compat（摘要）

- **dev：** `native.js` → `/dev-native-bridge` → `native-bridge.js` → `native-runtime.js`
- **客户端：** preload `chrome.send` → desktop-shell 主进程 → `native-runtime.js`
- **Compat：** `http://127.0.0.1:9000/api/*`，Header `api-key`

---

## 7. 模块与阶段进度快照

**唯一验收真相：** [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) 总进度一览（2026-07-14）

| 阶段 | 状态 | 备注 |
|------|------|------|
| S1–S4 | ✅ | 登录、权限、云同步、同步 UI |
| S5 | ✅ 基本通过 | CRX 绑定+注入日志 OK；`chrome://extensions` 待用户目视 |
| S6 | 🟢 | mongo HTTP 验收；HTTPS 待运维 — `S6-prod-2026-07-12.md` |
| S7 | 🟡 | Setup.exe 已产出；实机/生产 API 待验 — `S7-build-2026-07-14.md` |
| S8 | 🟢 基本通过 | INFRA + API-01–19 done；Cookie 第三期 pending |

| 模块 | 状态 | 缺口 |
|------|------|------|
| 00 Native Bridge | 🟢 | native-runtime ✅；生产桥在客户端壳 |
| 01 UI | 🟢 | — |
| 02 Auth | 🟢 | S1 ✅ |
| 03 RBAC | 🟢 | S2 ✅ |
| 04 CRX | 🟡 | S5 用户目视 |
| 05 云同步 | 🟢 | S3/S4 ✅ |
| 06 部署 | 🟡 | HTTPS + Setup 实机 + 生产 CloudApiBase 重建包 |
| 07 后端栈 | 🟢 | SQLite / Mongo |
| 08 COMPAT API | 🟢 API-01–19 | Cookie 第三期（API-20/21）未做 |

**当前优先（给下一拨 Multitask）：**

1. **E2E-2：** Setup 实机安装 → 窗口 → 登录（可先连本机 :3001）→ 启动指纹  
2. **生产 HTTPS** + 用真实 `CloudApiBase` **重打 Setup**  
3. （可选）S8 Cookie 第三期；S5 扩展目视；历史 env CDP 偶发超时  
4. **【提醒】自建 IP 查询**（见下方延后项）— S8 第二期已收尾，可安排实现  

**已完成预备（2026-07-15）：** `config/vb-paths.js` 统一 Win/macOS/Linux 数据根；管理端指纹 OS 可选 macOS/Linux（UA 伪装）；worker 主页跨平台展示 + Node 部署脚本。**Mac/Linux 客户端内核仍 Out of scope。**

### 延后项（须主动提醒用户）

| 项 | 说明 | 提醒时机 |
|----|------|----------|
| **自建 IP 查询 API** | 勿依赖 `virtualbrowser.cc` / ipgeolocation；拟 `GET /api/ip-geo` + 本地 IP 库，或按代理国家填默认语言/时区/坐标 | S8 第二期收尾或再提「IP查询」时 |

---

## 8. 常见坑

| 现象 | 正确做法 |
|------|----------|
| `chrome.send is not a function` | 开发用 `npm run dev` |
| Setup 连不上生产 | 用 HTTPS CloudApiBase 重跑 `build-client.ps1` |
| `makensis` 找不到 | PATH 加 `D:\NSIS`（或本机 NSIS 安装目录） |
| 恢复 app.asar | **禁止**；用 `desktop-shell/` |
| API-06 写成 closeBrowser | 官方路径是 **stopBrowser** |

---

## 9–10. 关键文档

| 文档 | 用途 |
|------|------|
| [`AGENT_COORDINATION.md`](docs/AGENT_COORDINATION.md) | Multitask 认领 |
| [`ACCEPTANCE.md`](docs/ACCEPTANCE.md) | S1–S8 勾选 |
| [`acceptance-reports/`](docs/acceptance-reports/) | 各阶段报告 |
| [`COMPAT_API.md`](docs/COMPAT_API.md) | S8 逐 API |
| [`CLOUD_DEPLOY.md`](docs/CLOUD_DEPLOY.md) | 云端部署 SOP |

---

## 11. Agent 接续检查清单

1. 读 **`AGENT_COORDINATION.md`** → 认领  
2. 读 **`ACCEPTANCE.md`** 总进度（勿信旧对话 / 本文件若冲突以 ACCEPTANCE 为准）  
3. 内核：`Test-Path Chrome-bin/VirtualBrowser/146.0.7680.72/VirtualBrowser.exe`  
4. Setup：`Test-Path packaging/output/VirtualBrowser-Setup-0.1.0.exe`  
5. 做跨模块 → `INTEGRATION.md`；做 API → `COMPAT_API.md`  
6. 中文回复；不懂标 **blocked**  

---

## 12. 版本信息

| 项 | 值 |
|----|-----|
| 内核 | 146.0.7680.72 |
| 安装包 | VirtualBrowser-Setup-0.1.0.exe |
| server | Vue 2.6 + Element UI |
| server-backend | NestJS 10 + SQLite/Mongo |
| 工作区 | `D:\bytesio\VirtualBrowser` |

---

## 13. Multitask 批次状态

| 批次 | 状态 |
|------|------|
| 0–4（Doc → E2E） | ✅ done |
| 5：S7-build + S6-prod | ✅ done（Setup 产出；mongo HTTP 通过） |
| **下一拨** | **E2E-2 实机**；生产 HTTPS；可选 bugfix-cdp / 文档维护 |

详见 [`docs/AGENT_COORDINATION.md`](docs/AGENT_COORDINATION.md)。
