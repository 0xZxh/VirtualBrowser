# 模块 00 — Native Bridge（环境 CRUD 与内核启动）

> **状态：** 🟢 基本完成  
> **交付基线：** [DELIVERY_STANDARD.md](../DELIVERY_STANDARD.md)  
> **最后更新：** 2026-07-04

## 1. 目标与边界

**负责：**

- 路线 B 下浏览器 dev 模式与指纹内核的通信（`dev-native-bridge`）
- 指纹环境配置的读写（`browser-list.json`、`virtual.dat`）
- 启动 / 停止内层 `VirtualBrowser.exe`
- 与 profile 打包、云同步、CRX 的 **native 入口**（具体逻辑在 lib 模块）

**不负责：**

- 用户登录与 RBAC（见 [02-auth-login](02-auth-login.md)、[03-rbac-permissions](03-rbac-permissions.md)）
- 云快照存储实现（见 [05-profile-cloud-sync](05-profile-cloud-sync.md) 后端部分）
- Chromium 内核修改

---

## 2. 架构与数据流

```mermaid
sequenceDiagram
  participant UI as server 前端
  participant NativeJS as api/native.js
  participant Bridge as mock/native-bridge.js
  participant Disk as LOCALAPPDATA/VirtualBrowser
  participant Exe as VirtualBrowser.exe

  UI->>NativeJS: chromeSend(name, params)
  NativeJs->>Bridge: POST /dev-native-bridge
  Bridge->>Disk: read/write browser-list, Workers
  Bridge->>Exe: spawn launchBrowser
```

**本地数据路径：**

| 路径 | 内容 |
|------|------|
| `User Data/browser-list.json` | 全部环境配置列表 |
| `User Data/global.dat` | 全局 JSON 配置 |
| `Workers/{envId}/` | Chromium `--user-data-dir` |
| `Workers/{envId}/virtual.dat` | 单环境指纹 JSON |

---

## 3. 关键文件索引

| 路径 | 职责 |
|------|------|
| [`server/src/api/native.js`](../../server/src/api/native.js) | 前端统一入口；dev 走 fetch bridge |
| [`server/src/api/native-bridge-client.js`](../../server/src/api/native-bridge-client.js) | 判断是否 dev bridge 模式 |
| [`server/mock/native-bridge.js`](../../server/mock/native-bridge.js) | Node 侧 native 实现 |
| [`server/mock/mock-server.js`](../../server/mock/mock-server.js) | 注册 bridge 路由 |
| [`config/chrome-bin.paths.json`](../../config/chrome-bin.paths.json) | 内核 exe 路径 |
| [`server/lib/profile-sync.js`](../../server/lib/profile-sync.js) | profile 打包（被 bridge 调用） |
| [`server/lib/cloud-sync.js`](../../server/lib/cloud-sync.js) | 云 pull/upload（被 bridge 调用） |
| [`server/lib/crx-store.js`](../../server/lib/crx-store.js) | CRX 列表（被 bridge 调用） |

---

## 4. 已完成清单

- [x] **0.0** 路线 B 落地 — 删除外层 Electron，保留 146.x 内核 — `Chrome-bin/VirtualBrowser/146.0.7680.72/`
- [x] **0.0** dev-native-bridge — `POST /dev-native-bridge` 挂 webpack devServer
- [x] **0.0** `getBrowserList` / `setBrowserList` — 读写 `browser-list.json`，同步 `Workers/{id}/virtual.dat`
- [x] **0.0** `launchBrowser` — `spawn` + `--worker-id` + `--user-data-dir`
- [x] **0.0** `deleteBrowser` / `getRuningBrowser` / `getBrowserVersion`
- [x] **0.0** `getGlobalData` / `setGlobalData` — `User Data/global.dat`
- [x] **0.0** launch 前 cloud pull、exit 后 auto-pack + upload — 见 [05-profile-cloud-sync](05-profile-cloud-sync.md)
- [x] **0.0** CRX native 方法转发 — 见 [04-crx-extensions](04-crx-extensions.md)
- [x] **0.0** `packProfile` / `unpackProfile` / `getProfileLocalMeta` — 见 [05-profile-cloud-sync](05-profile-cloud-sync.md)

---

## 5. 待办清单（细粒度）

### 5.1 生产与代理

| ID | 任务 | 验收标准 | 优先级 | 依赖模块 |
|----|------|----------|--------|----------|
| 0.1 | 生产 native 代理方案定稿 | [06-deployment](06-deployment.md) 落地 | **P0** | [06.3](06-deployment.md) |
| 0.2 | checkProxy 实现或明确废弃 | browser 页检测代理有真实结果或 UI 标注 | P2 | — |

### 5.2 安全与审计

| ID | 任务 | 验收标准 | 优先级 | 依赖模块 |
|----|------|----------|--------|----------|
| 0.3 | bridge 调用审计日志 | envId + 方法 + userId | P2 | [03.4](03-rbac-permissions.md#34) |
| 0.4 | 生产 bridge 鉴权 | 未登录不可 launch/delete | **P0** | [INTEGRATION §Auth→Bridge](../INTEGRATION.md#auth-bridge) |

### 5.3 与环境 / 插件衔接

| ID | 任务 | 验收标准 | 优先级 | 依赖模块 |
|----|------|----------|--------|----------|
| 0.5 | launchBrowser 注入 CRX | spawn 扩展参数 | **P0** | [04.6](04-crx-extensions.md#46) |
| 0.6 | getBrowserList 按用户过滤 | 与 backend `/api/environments` 一致 | **P0** | [3.13](03-rbac-permissions.md#35) |

---

## 6. 手动验证步骤

```powershell
# 1. 确认内核存在
Test-Path D:\bytesio\VirtualBrowser\Chrome-bin\VirtualBrowser\146.0.7680.72\VirtualBrowser.exe

# 2. 启动 dev
cd D:\bytesio\VirtualBrowser\server
npm run dev

# 3. 测 bridge
curl -s -X POST http://localhost:9527/dev-native-bridge `
  -H "Content-Type: application/json" `
  -d '{"name":"getBrowserList","params":[]}'

# 4. UI：创建环境 → 启动 → 应弹出指纹窗口
```

**常见错误：**

| 现象 | 处理 |
|------|------|
| `chrome.send is not a function` | 必须用 `npm run dev`，非静态服务器 |
| 内核不存在 | 安装/恢复 `Chrome-bin/146.x` |

---

## 7. 关联模块

- **上游：** [02-auth-login](02-auth-login.md)（未来 bridge 鉴权）、[03-rbac](03-rbac-permissions.md)（环境过滤）
- **下游：** [05-profile-cloud-sync](05-profile-cloud-sync.md)（launch 生命周期）、[04-crx-extensions](04-crx-extensions.md)（启动注入）
- **衔接：** [INTEGRATION §CRX→Launch](../INTEGRATION.md#crx-launch)、[§RBAC→EnvList](../INTEGRATION.md#rbac-envlist)
