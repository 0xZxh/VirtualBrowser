# Compat REST API — 待办与逐接口交付清单

> **用途：** 供本机或其他设备上的 Agent / 开发者按项实现、验收、更新状态。  
> **最后更新：** 2026-07-09  
> **协议参考：** [Apifox llms.txt](https://2uzg2znjfy.apifox.cn/llms.txt)（不依赖官网 Pro api-key）  
> **关联计划：** [`.cursor/plans/backend_native_api_整合_9545f4b9.plan.md`](../.cursor/plans/backend_native_api_整合_9545f4b9.plan.md)

---

## Agent 使用说明

1. **只认领一项**：从下方「总待办」中选 `status: pending` 且依赖已 ✅ 的条目，改为 `in_progress` 并注明执行者/日期。
2. **严格串行（第一期）**：`INFRA-A` → `INFRA-B` → `API-01` … → `API-08`；前一项未 ✅ 不开始下一项。
3. **每项必须包含**：实现文件路径、验收命令、实际响应样例（可粘贴）、最终 `status: done` 或 `blocked` + 原因。
4. **做不出来就标 `blocked`**，写清原因，不要标 done。
5. **环境要求**：Windows、已安装 `Chrome-bin/VirtualBrowser/146.0.7680.72/`、`server-backend` 与内核同机。

### 服务与鉴权约定

| 项 | 值 |
|----|-----|
| Compat API 基址 | `http://127.0.0.1:9000`（`COMPAT_API_PORT`，与 `:3001` 同进程双 listener） |
| 管理 API 基址 | `http://127.0.0.1:3001` |
| 鉴权 Header | `api-key: <自建 key>`（见 `server-backend/data/local/initial-api-key.txt` 或 `POST /api/api-keys`） |
| 成功响应（多数） | `{ "success": true, "data": ... }` |
| 失败响应 | `{ "success": false, "message": "..." }` 或 HTTP 401/403/404 |

### 关键源码索引

| 路径 | 职责 |
|------|------|
| [`server/mock/native-bridge.js`](../server/mock/native-bridge.js) | 现有 native 实现（待抽离） |
| [`server/lib/native-runtime.js`](../server/lib/native-runtime.js) | **待建** 共享内核运行时 |
| [`server/lib/crx-store.js`](../server/lib/crx-store.js) | CRX 列表/上传/删除 |
| [`server/lib/profile-sync.js`](../server/lib/profile-sync.js) | Profile 打包/缓存路径 |
| [`server-backend/src/environments/`](../server-backend/src/environments/) | 环境 DB + RBAC |
| [`server-backend/src/browser/compat.controller.ts`](../server-backend/src/browser/compat.controller.ts) | **待建** Apifox 协议路由 |
| [`automation/test-api.js`](../automation/test-api.js) | launchBrowser + Playwright 验收脚本 |

---

## 总待办（可勾选）

状态：`pending` | `in_progress` | `done` | `blocked`

### 前置基础设施

| ID | 任务 | 依赖 | 状态 | 验收标准 |
|----|------|------|------|----------|
| **INFRA-A** | 抽离 [`server/lib/native-runtime.js`](../server/lib/native-runtime.js)；`native-bridge.js` 改为薄封装 | — | `pending` | `launchBrowser` 返回 `debuggingPort`；`stopBrowser(envId)` 可 kill 进程 |
| **INFRA-A.1** | `allocateDebugPort()` / `releaseDebugPort()`（如 19200–19999） | INFRA-A | `pending` | 多 env 启动端口不冲突 |
| **INFRA-A.2** | `launchBrowser` spawn 增加 `--remote-debugging-port=` | INFRA-A.1 | `pending` | 返回 `{ ok, debuggingPort, envId }` |
| **INFRA-A.3** | 新增 `stopBrowser(envId)`（Apifox 路径名，非 closeBrowser） | INFRA-A | `pending` | kill 后触发 exit pack/upload 钩子 |
| **INFRA-A.4** | [`server/mock/native-bridge.js`](../server/mock/native-bridge.js) 调用 native-runtime | INFRA-A | `pending` | 现有 UI dev 启动仍可用 |
| **INFRA-B** | 自建 api-key：`api_keys` 表 + `ApiKeyGuard` | — | `pending` | 无 key → 401 |
| **INFRA-B.1** | 种子 key → `server-backend/data/local/initial-api-key.txt`（gitignore） | INFRA-B | `pending` | 首次启动控制台打印 |
| **INFRA-B.2** | `POST/GET/DELETE /api/api-keys`（admin） | INFRA-B | `pending` | admin 可签发/吊销 |
| **INFRA-C** | Nest `BrowserModule` + `:9000` Compat listener | INFRA-A, INFRA-B | `pending` | `curl :9000/api/getBrowserList` 可达（实现后） |
| **INFRA-C.1** | `NativeSyncService`：DB → `browser-list.json` + `Workers/{id}/virtual.dat` | INFRA-C | `pending` | launch 前磁盘与 DB 一致 |
| **INFRA-C.2** | `BrowserService` 统一：鉴权 → sync → native → 格式化响应 | INFRA-C | `pending` | 各 API 共用 |

---

### 第一期 — 核心 8 API（必交付）

| ID | 路径 | 方法 | 依赖 | 状态 | Apifox 文档 |
|----|------|------|------|------|-------------|
| **API-01** | `/api/getBrowserList` | GET, POST | INFRA-C | `pending` | [GET](https://2uzg2znjfy.apifox.cn/288388254e0.md) / [POST](https://2uzg2znjfy.apifox.cn/381873501e0.md) |
| **API-02** | `/api/addBrowser` | POST | API-01 | `pending` | [创建环境](https://2uzg2znjfy.apifox.cn/321886209e0.md) |
| **API-03** | `/api/updateBrowser` | POST | API-02 | `pending` | [更新环境](https://2uzg2znjfy.apifox.cn/321893351e0.md) |
| **API-04** | `/api/deleteBrowser` | POST | API-03 | `pending` | [删除环境](https://2uzg2znjfy.apifox.cn/321894159e0.md) |
| **API-05** | `/api/launchBrowser` | POST | API-04, INFRA-A.2 | `pending` | [启动环境](https://2uzg2znjfy.apifox.cn/321901971e0.md) |
| **API-06** | `/api/stopBrowser` | POST | API-05, INFRA-A.3 | `pending` | [关闭环境](https://2uzg2znjfy.apifox.cn/321904096e0.md) |
| **API-07** | `/api/getBrowserRunningList` | GET | API-06 | `pending` | [运行中列表](https://2uzg2znjfy.apifox.cn/288413645e0.md) |
| **API-08** | `/api/getCrxList` | GET | INFRA-C | `pending` | [插件列表](https://2uzg2znjfy.apifox.cn/321938421e0.md) |

---

### 第二期 — 扩展 11 API（第一期全部 ✅ 后再做）

| ID | 路径 | 方法 | 依赖 | 状态 | 说明 |
|----|------|------|------|------|------|
| **API-09** | `/api/getBrowserFullParameters` | GET | API-01 | `pending` | 全量 payload + `isRunning` |
| **API-10** | `/api/isBrowserRunning` | GET | API-07 | `pending` | 响应为 **bare boolean** |
| **API-11** | `/api/deleteBrowserData` | POST | API-06 | `pending` | 删 Workers 数据，保留元数据 |
| **API-12** | `/api/clearCache` | POST | API-06 | `pending` | 删 Cache/Code Cache |
| **API-13** | `/api/getGroupList` | GET | INFRA-C | `pending` | 分组持久化 backend/global.dat |
| **API-14** | `/api/addGroup` | POST | API-13 | `pending` | |
| **API-15** | `/api/updateGroup` | POST | API-13 | `pending` | |
| **API-16** | `/api/deleteGroup` | POST | API-13 | `pending` | |
| **API-17** | `/api/deleteCrx` | POST | API-08 | `pending` | `crx-store.deleteLocalCrx` |
| **API-18** | `/api/randomizeFingerprint` | POST | API-03 | `pending` | 移植 `browser/index.vue` 随机逻辑 |
| **API-19** | `/api/addCrx` | POST | API-08 | `pending` | **仅** base64/本地路径；`storeUrl` 见 blocked |

---

### 第三期 — Cookie 专项（可选）

| ID | 路径 | 方法 | 依赖 | 状态 | 说明 |
|----|------|------|------|------|------|
| **API-20** | `/api/getCookie` | GET | API-06 | `pending` | 环境须已关闭；读 SQLite Cookies |
| **API-21** | `/api/updateCookie` | POST | API-20 | `pending` | 写 Cookies 或 virtual.dat |

---

### 明确 blocked（勿实现为 done）

| ID | 路径 | 原因 |
|----|------|------|
| **BLOCK-01** | `/api/addCrx` 仅 `storeUrl` | [`crx-store.js`](../server/lib/crx-store.js) 无法从 Chrome 商店下载 |
| **BLOCK-02** | `/api/getAccountList` | 无 Login Data / DPAPI 实现 |
| **BLOCK-03** | `/api/addAccount` | 同上 |
| **BLOCK-04** | `/api/deleteAccount` | 同上 |
| **BLOCK-05** | `/api/updateAccount` | 同上 |
| **BLOCK-06** | 官网 MCP / CLI | 闭源，不在仓库范围 |
| **BLOCK-07** | `checkProxy` REST | native-bridge 标注未实现 |

---

## 逐接口交付规格（第一期）

> 实现完成后在本节对应 API 下填写：**状态**、**实现文件**、**验收命令输出**、**已知差异**。

---

### API-01 — getBrowserList

- **状态：** `pending`
- **路径：** `GET /api/getBrowserList`，`POST /api/getBrowserList`
- **Header：** `api-key` 必填
- **POST Body（可选）：** `{ "group": "group1" }` 按分组名过滤
- **实现要点：**
  - `EnvironmentsService.listForUser(req.user)`
  - 可选 `group` 过滤（匹配 `item.group`）
  - `NativeSyncService.syncForUser()` 可选（list 可不写盘）
- **预期响应：**
```json
{
  "success": true,
  "data": {
    "users": [
      { "id": 1, "name": "环境1", "group": "默认分组" }
    ]
  }
}
```
- **验收命令：**
```powershell
curl.exe -s -H "api-key: YOUR_KEY" http://127.0.0.1:9000/api/getBrowserList
curl.exe -s -X POST -H "api-key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"group\":\"默认分组\"}" http://127.0.0.1:9000/api/getBrowserList
```
- **RBAC：** operator 只见自己的 env；admin 见 tenant 全部
- **实现文件：** _（待填）_
- **验收结果：** _（待填）_

---

### API-02 — addBrowser

- **状态：** `pending`
- **路径：** `POST /api/addBrowser`
- **Body（Apifox 必填）：** `name`, `group[]`, `chrome_version`, `proxy`, `homepage`
- **实现要点：**
  - 映射 `group[]` → 字符串 `group`（取首项或 join，与 UI 一致）
  - `EnvironmentsService.create` → `NativeSyncService.syncEnv`
- **预期响应：**
```json
{ "success": true, "data": { "id": 85 } }
```
- **验收命令：**
```powershell
curl.exe -s -X POST -H "api-key: YOUR_KEY" -H "Content-Type: application/json" -d "{\"name\":\"API测试\",\"group\":[\"默认分组\"],\"chrome_version\":146,\"proxy\":{\"mode\":0,\"value\":\"\",\"protocol\":\"HTTP\",\"host\":\"\",\"port\":\"\",\"user\":\"\",\"pass\":\"\",\"API\":\"\"},\"homepage\":{\"mode\":1,\"value\":\"https://baidu.com\"}}" http://127.0.0.1:9000/api/addBrowser
```
- **验收：** API-01 可见新 id；`%LOCALAPPDATA%\VirtualBrowser\Workers\{id}\virtual.dat` 存在
- **限制：** 其他指纹字段若出现在 body 中写入 `payload`，不单独校验
- **实现文件：** _（待填）_

---

### API-03 — updateBrowser

- **状态：** `pending`
- **路径：** `POST /api/updateBrowser`
- **Body：** `{ "id": 84, "name"?, "proxy"?, ... }`，**id 必填**
- **实现要点：** `assertCanAccess` → merge payload → `update` → sync
- **预期响应：** `{ "success": true }`
- **验收：** 改 name 后 API-01 反映；改 proxy 后 launch 使用新代理（抽查）
- **实现文件：** _（待填）_

---

### API-04 — deleteBrowser

- **状态：** `pending`
- **路径：** `POST /api/deleteBrowser`
- **Body：** `{ "id": 84 }`
- **实现要点：** 若运行中先 `stopBrowser` → native 清理 → `EnvironmentsService.remove`
- **预期响应：** `{ "success": true }`
- **验收：** API-01 无此项；重复删除返回明确错误
- **实现文件：** _（待填）_

---

### API-05 — launchBrowser（关键）

- **状态：** `pending`
- **路径：** `POST /api/launchBrowser`
- **Body：** `{ "id": 1 }`；可选 `name` / `remark` / `tempLaunchArgs`
- **实现要点：**
  - sync 磁盘 → spawn 内核 + `--worker-id` + `--user-data-dir` + `--remote-debugging-port`
  - cloud pull（有 Bearer 时）沿用现有 bridge 逻辑
  - `tempLaunchArgs` 拆分为额外 spawn 参数（需实测特殊字符）
- **预期响应（以 [`automation/test-api.js`](../automation/test-api.js) 为准）：**
```json
{
  "success": true,
  "data": {
    "debuggingPort": 19201
  }
}
```
- **验收命令：**
```powershell
cd automation
# 设置 API_KEY 与 BASE_URL=http://127.0.0.1:9000 后
npm test
```
- **验收：** Playwright `connectOverCDP` 成功打开页面
- **失败则标 blocked，不进入 API-06**
- **实现文件：** _（待填）_

---

### API-06 — stopBrowser

- **状态：** `pending`
- **路径：** `POST /api/stopBrowser`（**Apifox 官方路径，不是 closeBrowser**）
- **Body：** `{ "id": 1 }`；可选 `name` / `remark`
- **实现要点：** `native-runtime.stopBrowser(envId)` kill 进程、释放 debuggingPort
- **预期响应：** `{ "success": true }`
- **验收：** API-07 不含该 id；任务管理器无对应 VirtualBrowser 进程
- **实现文件：** _（待填）_

---

### API-07 — getBrowserRunningList

- **状态：** `pending`
- **路径：** `GET /api/getBrowserRunningList`
- **实现要点：** 内存 running 表 ∩ 当前用户可见 envId
- **预期响应（Apifox 示例）：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "1",
      "debuggingPort": 19201,
      "webdriverPath": null
    }
  ]
}
```
- **已知差异：** 本仓库**无 chromedriver**，`webdriverPath` 固定 `null` 或省略
- **验收：** launch 后有记录；stop 后无记录
- **实现文件：** _（待填）_

---

### API-08 — getCrxList

- **状态：** `pending`
- **路径：** `GET /api/getCrxList`
- **实现要点：** `crx-store.getCrxList()` → `{ data: { list } }`
- **预期响应：**
```json
{ "success": true, "data": { "list": [] } }
```
- **验收：** 与 UI 插件管理页数量一致
- **实现文件：** _（待填）_

---

## 第二期接口摘要（实现时展开为与上同格式的小节）

| ID | 路径 | 实现映射 |
|----|------|----------|
| API-09 | `GET /api/getBrowserFullParameters` | `listForUser` 全字段 + running 状态 |
| API-10 | `GET /api/isBrowserRunning?id=` | 返回 bare `true`/`false`，非 JSON 包装 |
| API-11 | `POST /api/deleteBrowserData` | 递归删 `Workers/{id}` 除 `virtual.dat` 或整目录后重建 |
| API-12 | `POST /api/clearCache` | 删 Profile 下 Cache、Code Cache、GPUCache 等 |
| API-13–16 | 分组 CRUD | 新建 `groups` 表或 `global.dat.group` 持久化 |
| API-17 | `POST /api/deleteCrx` | body `{ id }` → `deleteLocalCrx` |
| API-18 | `POST /api/randomizeFingerprint` | 移植 [`index.vue`](../server/src/views/browser/index.vue) `preProcessData` 随机段 |
| API-19 | `POST /api/addCrx` | `{ name, base64 }` 或 `{ path }`；拒绝纯 `storeUrl` → BLOCK-01 |

---

## 第三期接口摘要

| ID | 路径 | 技术要点 |
|----|------|----------|
| API-20 | `GET /api/getCookie?id=` | 读 `Workers/{id}/Default/Cookies`（better-sqlite3）；环境必须已 stop |
| API-21 | `POST /api/updateCookie` | body `{ id, cookies: [...] }`；写入 SQLite 或 env `cookie.jsonStr` |

---

## 响应字段差异登记表

| 字段 | Apifox | 本实现 | 状态 |
|------|--------|--------|------|
| `launchBrowser` 响应 | schema 空 | `{ data: { debuggingPort } }` | 待验收 |
| `getBrowserRunningList[].webdriverPath` | chromedriver 路径 | `null` | 已知差异 |
| `isBrowserRunning` | bare boolean | 必须 bare boolean | 待实现 |
| `getBrowserList` POST filter | `group: "group1"` | 按 `group` 字段过滤 | 待实现 |

---

## 进度汇总

| 阶段 | 总数 | done | blocked | pending |
|------|------|------|---------|---------|
| 前置 INFRA | 11 | 0 | 0 | 11 |
| 第一期 API | 8 | 0 | 0 | 8 |
| 第二期 API | 11 | 0 | 0 | 11 |
| 第三期 API | 2 | 0 | 0 | 2 |
| 明确 blocked | 7 | — | 7 | — |

**更新方式：** Agent 完成一项后，同步修改本文件对应行的 `状态` 与「进度汇总」计数，并提交 git。

---

## 启动联调（实现 INFRA 后）

```powershell
# 终端 1
cd server-backend
npm run start:dev

# 终端 2（UI 可选）
cd server
npm run dev

# 验收 Compat API
$env:API_KEY = Get-Content server-backend/data/local/initial-api-key.txt
curl.exe -s -H "api-key: $env:API_KEY" http://127.0.0.1:9000/api/getBrowserList
```

---

## 相关文档

- [INTEGRATION.md](INTEGRATION.md) — Auth→Bridge、RBAC→EnvList
- [modules/00-native-bridge.md](modules/00-native-bridge.md) — native 能力清单
- [modules/07-backend-stack.md](modules/07-backend-stack.md) — server-backend 栈
- [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md) — 可交付基线
