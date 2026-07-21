# 分阶段验收记录

> **最后更新：** 2026-07-18（E2E-2 实机部分通过；CloudApiBase=`http://120.78.76.171:3001`）
> **交付基线：** [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md)  
> **用途：** 各阶段验收步骤 + 验收人勾选进度 + 问题记录  
> **Multitask：** 认领见 [AGENT_COORDINATION.md](AGENT_COORDINATION.md)；Agent 报告见 [acceptance-reports/](acceptance-reports/)

---

## 验收环境（每次验收前确认）


| 项       | 要求                                                                                     |
| ------- | -------------------------------------------------------------------------------------- |
| 后端      | `cd server-backend && npm run start:dev` → `http://localhost:3001/health` 返回 `ok:true` |
| 前端      | `cd server && npm run dev` → `http://localhost:9527`                                   |
| 测试账号    | admin/admin123、operator/operator123、viewer/viewer123                                   |
| 内核（S3+） | `Chrome-bin` 已安装（启动指纹环境用）                                                              |


**常见问题：**

- 登录 `timeout 10000ms` → 确认 backend 在跑；重启 frontend（mock-server 代理修复需重启）
- `EADDRINUSE :3001` → 结束占用 3001 的旧进程
- 无退出登录 → 右上角用户名下拉 →「退出登录」（2026-07-05 已修复 Navbar 隐藏问题）

---


## 总进度一览


| 阶段     | 范围                   | 状态         | 验收人备注                       |
| ------ | -------------------- | ---------- | --------------------------- |
| **S1** | 登录 + 用户管理 + 登出 + 持久化 | ✅ **基本通过** | 2026-07-05 验收人确认：登录/登出/角色/用户管理/持久化基本正常 |
| **S2** | 环境归属 + 快照 403 + 分配浏览器 | ✅ **通过** | 2026-07-07 验收人确认功能测试正常 |
| **S3** | 登录 token → 云同步       | ✅ **通过** | 与 S2 一并验收；launch 自动 upload/pull |
| **S4** | 同步状态 UI + 立即同步       | ✅ **通过** | 2026-07-11 Agent-Verify；见 `acceptance-reports/S4-2026-07-11.md` |
| **S5** | CRX 绑定 + launch 注入   | ✅ **基本通过** | 2026-07-11 Agent-Verify；chrome://extensions 待用户目视；见 `S5-2026-07-11.md` |
| **S6** | 云端部署（Mongo + HTTPS + CLOUD_DEPLOY） | 🟢 **公网 HTTP mongo 通过，HTTPS 待运维** | 2026-07-18 E2E-2：`120.78.76.171:3001` health/login/创建环境 OK；HTTPS 待运维 |
| **S7** | 客户端安装包（desktop-shell + NSIS） | 🟢 **实机安装+窗口+云端+指纹启动通过** | E2E-2：Setup 已用生产 IP 重打；卸载未测；见 `E2E-2-2026-07-18.md` |
| **S8** | COMPAT API（INFRA + API-01–19） | 🟢 **第一期+第二期完成** | API-01..08 + API-09..19 done；Cookie 20/21 pending；见 `COMPAT_API.md` |


**图例：** ⬜ 未开始 · 🟡 进行中 · ✅ 通过 · ❌ 未通过

---



## S1 — 登录 + 用户管理 + 登出（2.4–2.6、2.10–2.12）



### 验收步骤



#### S1-1 启动与健康检查

1. 启动 backend、frontend（见上文）
2. `curl http://127.0.0.1:3001/health` → `storage: local`
3. 浏览器打开 [http://localhost:9527/login](http://localhost:9527/login)


| 检查项       | 通过  |
| --------- | --- |
| health 正常 | ☑   |
| 登录页可打开    | ☑   |




#### S1-2 登录

1. 输入 `admin` / `admin123` → 登录
2. 刷新页面 → 仍保持登录
3. 未登录直接访问 `/#/browser` → 跳转登录页


| 检查项                  | 通过  | 备注              |
| -------------------- | --- | --------------- |
| admin 登录成功（无 10s 超时） | ☑   | 曾报 proxy 超时，已修复 |
| 刷新保持登录               | ☑   |                 |
| 未登录拦截                | ☑   |                 |




#### S1-3 退出登录

1. 登录后看右上角：**用户图标 + 用户名**
2. 点击 → **退出登录**
3. 回到登录页；再访问业务页需重新登录


| 检查项          | 通过  | 备注                                          |
| ------------ | --- | ------------------------------------------- |
| 界面有退出入口      | ☑   | 2026-07-05 修复 Navbar；2026-07-05 复验通过         |
| 退出后 token 清除 | ☑   |                                             |
| 退出后无法访问业务页   | ☑   |                                             |




#### S1-4 角色菜单差异

分别用三个账号登录，对比侧栏：


| 账号       | 系统管理 | 分组  | CRX | 浏览器 |
| -------- | ---- | --- | --- | --- |
| admin    | 有    | 有   | 有   | 有   |
| operator | 无    | 有   | 有   | 有   |
| viewer   | 无    | 无   | 无   | 有   |



| 检查项            | 通过  |
| -------------- | --- |
| admin 有系统管理    | ☑   |
| operator 无系统管理 | ☑   |
| viewer 仅浏览器    | ☑   |




#### S1-5 用户管理 UI（admin）

1. admin → **系统管理 → 用户管理**
2. 新建 operator（如 `test-op` / `test123`）
3. 用新账号登录 → 无系统管理
4. viewer 直接访问 `/#/system/users` → 进不去


| 检查项             | 通过  |
| --------------- | --- |
| 用户列表可见          | ☑   |
| 新建 operator 成功  | ☑   |
| 新账号权限正确         | ☑   |
| 非 admin 无法进用户管理 | ☑   |




#### S1-6 数据持久化

1. admin 在用户管理页确认用户 ≥ 3 条
2. **重启 backend**（Ctrl+C → `npm run start:dev`）
3. 再登录 → 用户仍在（含新建账号）


| 检查项                | 通过   |
| ------------------ | ---- |
| 重启后用户仍在            | ☑    |
| 密码为 bcrypt 哈希（非明文） | ☐ 可选 |


**S1 阶段结论：** ☑ 通过（基本） · ☐ 未通过 · ☐ 进行中

> **2026-07-05** 验收人反馈：S1 验证基本正常。可选项 bcrypt 目检未强制要求。

---



## S2 — 环境归属 + 快照隔离（3.5、3.8、3.13、3.14）



### 验收步骤



#### S2-1 环境列表按用户隔离

1. **admin** 登录 → 浏览器页 → 新建环境（记 envId A）
2. **operator** 登录 → 新建环境（记 envId B）
3. operator 登录时 **只见 B，不见 A**
4. admin 登录 → **见 tenant 内全部**


| 检查项              | 通过  |
| ---------------- | --- |
| operator 只见自己的环境 | ☐   |
| admin 见全部        | ☐   |




#### S2-2 按钮权限


| 角色       | 新建/编辑 | 删除  |
| -------- | ----- | --- |
| admin    | ✓     | ✓   |
| operator | ✓     | ✗   |
| viewer   | ✗     | ✗   |



| 检查项            | 通过  |
| -------------- | --- |
| operator 无删除按钮 | ☐   |
| viewer 无新建     | ☐   |




#### S2-3 快照 API 403

```powershell
# 1. 登录拿 token
@'{"username":"operator","password":"operator123"}'@ | Set-Content -Encoding utf8 tmp-login.json -NoNewline
curl.exe -s -X POST http://127.0.0.1:3001/auth/login -H "Content-Type: application/json" --data-binary "@tmp-login.json"
```

用 operator token 访问 **admin 拥有的 envId**：

```powershell
curl.exe -s -w "\nHTTP:%{http_code}\n" http://127.0.0.1:3001/api/profiles/<admin的envId>/snapshot/meta -H "Authorization: Bearer <operator_token>"
```


| 检查项                          | 通过  |
| ---------------------------- | --- |
| 他人 envId → HTTP 403          | ☐   |
| 自己的 envId → 200 或 404（非 403） | ☐   |


**S2 阶段结论：** ☑ 通过 · ☐ 未通过 · ☐ 进行中

> **2026-07-07** 验收人确认：环境隔离、分配浏览器、权限按钮等功能测试正常。

---



## S3 — 登录 token 云同步（2.7、5.9）



### 验收步骤

**前提：** 已 admin 登录 UI；**不要**设置 `CLOUD_API_TOKEN`。

#### S3-1 启动 → 关闭 → 自动 upload

1. 浏览器页启动一个环境（需 Chrome-bin）
2. 打开网站产生 Cookie → **关闭**指纹窗口
3. 看 frontend 终端日志 → `cloud upload ok` 或 `cloud pull skipped`


| 检查项                           | 通过  |
| ----------------------------- | --- |
| 无 CLOUD_API_TOKEN 仍有 cloud 日志 | ☐   |
| upload ok（或合理 skip）           | ☐   |




#### S3-2 云端有快照

```powershell
curl.exe -s http://127.0.0.1:3001/api/profiles/<envId>/snapshot/meta -H "Authorization: Bearer <admin_token>"
```


| 检查项                 | 通过  |
| ------------------- | --- |
| 返回 code:0 与 version | ☐   |




#### S3-3 跨机 pull（同机模拟）

1. 删除 `%LOCALAPPDATA%\VirtualBrowser\Workers\<envId>` 与 `ProfileSnapshots\<envId>`
2. 再次启动同一环境 → 终端 `cloud pull ok`


| 检查项     | 通过  |
| ------- | --- |
| pull 成功 | ☐   |


**S3 阶段结论：** ☑ 通过 · ☐ 未通过 · ☐ 进行中

> **2026-07-07** 与 S2 一并验收（登录 Bearer 自动云同步，无需 CLOUD_API_TOKEN）。

---

## S4 — 同步状态 UI（5.7、5.8）

### 验收步骤

1. admin/operator 登录 → 浏览器列表出现 **「云同步」** 列
2. 每行显示状态标签（已同步 / 云端较新 / 仅本地等）及 **本地 vX / 云端 vY**
3. 点击 **云同步** 下拉 → **上传到云端** / **从云端拉取** / **刷新状态**
4. 环境运行中时同步应提示先关闭

| 检查项 | 通过 |
|--------|------|
| 列表显示同步状态 | ☑ |
| 手动上传成功 | ☑ |
| 手动拉取成功 | ☑ |
| viewer 无同步按钮 | ☑ |

**S4 阶段结论：** ☑ 通过 · ☐ 未通过 · ☐ 进行中

> **2026-07-11** Agent-Verify：API + 终端日志验收通过；详见 [`acceptance-reports/S4-2026-07-11.md`](acceptance-reports/S4-2026-07-11.md)。

---

## S5 — CRX 注入（4.6、4.7）

### 验收步骤

1. admin/operator 登录 → **插件管理** 上传 `.crx` 或 `.zip` 插件
2. **浏览器** → 新建/编辑环境 → **绑定插件** 多选已上传插件 → 保存
3. 启动该环境 → 前端 dev 终端应出现 `[dev-native-bridge] load-extension envId= ... paths= [...]`
4. 在 Chrome 中打开 `chrome://extensions` 确认扩展已加载
5. viewer 登录 → 插件管理页无上传/删除/启用开关

| 检查项 | 通过 |
|--------|------|
| 环境表单可绑定插件 | ☑ |
| 保存后 crx-list 绑定正确 | ☑ |
| launchBrowser 加载扩展 | ☑ |
| viewer 无插件上传/删除 | ☑ |

**S5 阶段结论：** ☑ 基本通过 · ☐ 未通过 · ☐ 进行中

> **2026-07-11** Agent-Verify：4 项必检通过；`chrome://extensions` 目视待用户补验。详见 [`acceptance-reports/S5-2026-07-11.md`](acceptance-reports/S5-2026-07-11.md)。

---

## S6 — 云端部署（6.1–6.9、CLOUD_DEPLOY.md）

### 验收步骤

1. 按 [`CLOUD_DEPLOY.md`](CLOUD_DEPLOY.md) 部署 `server-backend`
2. `STORAGE_DRIVER=mongo` + `MONGODB_URI` 可连
3. `GET https://<api-domain>/health` → `ok: true`
4. 管理 API 登录、用户、环境、快照 API 经 HTTPS 可达
5. CORS 允许客户端/Electron 来源（或约定 origin）
6. 多客户端可同时连接同一云端

| 检查项 | 通过 |
|--------|------|
| CLOUD_DEPLOY.md 可重复部署 | ☑ |
| Mongo 持久化用户/环境 | ☑ |
| HTTPS health 正常 | ☐ |
| 登录 + 创建环境 API 正常 | ☑ |
| CORS 配置正确 | ☑ |
| 公网 HTTP health（120.78.76.171:3001） | ☑ |

**S6 阶段结论：** ☑ **公网 HTTP mongo 验收通过** · ☐ 未通过 · ☐ 进行中（HTTPS 仍待）

> **2026-07-11** Agent-S6：CLOUD_DEPLOY.md + CORS 代码就绪。  
> **2026-07-12** Agent-E2E：本地 dev API（`:3001`）登录 admin、创建环境通过；Mongo + HTTPS 生产部署未执行。详见 [`acceptance-reports/E2E-2026-07-12.md`](acceptance-reports/E2E-2026-07-12.md)。  
> **2026-07-12** Agent-S6-Prod：`STORAGE_DRIVER=mongo` 实机验收通过（health/login/创建环境/CORS/持久化）；**HTTP 内网验收通过，HTTPS 待运维**。详见 [`acceptance-reports/S6-prod-2026-07-12.md`](acceptance-reports/S6-prod-2026-07-12.md)。
> **2026-07-12** Agent-S7-Build：`electron/dist`、`packaging/staging` 验证通过；`makensis` 未安装，无 Setup.exe；云端占位 `https://your-api.example.com`。详见 [`acceptance-reports/S7-build-2026-07-12.md`](acceptance-reports/S7-build-2026-07-12.md)。
> **2026-07-18** Agent-E2E-2：公网 `http://120.78.76.171:3001` health（mongo connected）/ admin 登录 / 创建环境通过；**HTTPS 仍待运维**。详见 [`acceptance-reports/E2E-2-2026-07-18.md`](acceptance-reports/E2E-2-2026-07-18.md)。

---

## S7 — 客户端安装包（desktop-shell + NSIS）

### 验收步骤

1. 运行 `VirtualBrowser-Setup-x.x.x.exe` 完成安装
2. 桌面快捷方式启动 → **独立桌面窗口**（非系统浏览器标签）
3. 登录**云端** API（非 localhost dev）
4. 创建环境 → 启动 → 弹出指纹浏览器窗口
5. 关闭管理窗口后行为符合预期（托盘或一并退出，按产品定夺）
6. 卸载后 `%LOCALAPPDATA%\VirtualBrowser\` 用户数据保留

| 检查项 | 通过 |
|--------|------|
| 安装包可安装 | ☑ |
| 桌面窗口启动 | ☑ |
| 登录云端成功 | ☑ |
| 创建/启动指纹环境 | ☑ |
| 卸载保留用户数据 | ☐ |
| build-client staging（Chrome-bin + dist + client.json） | ☑ |
| desktop-shell smoke | ☑ |
| packaging/output Setup.exe | ☑ |

**S7 阶段结论：** ☐ 完全通过 · ☐ 未通过 · 🟢 **实机主路径通过**（安装/窗口/云端登录/指纹启动 OK；卸载未测；CloudApiBase=`http://120.78.76.171:3001`）

> **2026-07-11** Agent-S7：desktop-shell + packaging 脚本就绪；smoke 通过。  
> **2026-07-12** Agent-E2E：`native-runtime` / desktop-shell smoke 通过；`build-client.ps1` 因缺 NSIS（`makensis`）与 Electron dist 未生成 Setup.exe；Electron 窗口与安装包路径未验证。详见 [`acceptance-reports/E2E-2026-07-12.md`](acceptance-reports/E2E-2026-07-12.md)、[`acceptance-reports/S7-2026-07-11.md`](acceptance-reports/S7-2026-07-11.md)。

> **2026-07-14** Agent-S7-Build：`makensis` v3.12（`D:\NSIS`，已加 User PATH）；`packaging/output/VirtualBrowser-Setup-0.1.0.exe` 已生成；`config/client.json` 的 `cloudApiBase=http://127.0.0.1:3001`（本地临时，生产 HTTPS 待定）。详见 [`acceptance-reports/S7-build-2026-07-14.md`](acceptance-reports/S7-build-2026-07-14.md)。
> **2026-07-14（补）** 修复安装后缺 `adm-zip`：`build-client.ps1` 现将 `server/node_modules/adm-zip` 纳入 staging 并做 require 校验；已重打 Setup。见同报告「追加备注」。
> **2026-07-18** Agent-E2E-2：用生产 IP 重打 Setup（含 UI `VUE_APP_BASE_API` + `vb-paths.js`）；`/S` 安装 → 桌面窗口 → 云端列表 → native-runtime 启动指纹（CDP 19200）通过；卸载未测。详见 [`acceptance-reports/E2E-2-2026-07-18.md`](acceptance-reports/E2E-2-2026-07-18.md)。
---


## S8 — COMPAT API（模块 08：第一期 + 第二期）

> **逐 API 规格与状态：** [`COMPAT_API.md`](COMPAT_API.md)（任务真相）  
> **执行计划：** [`.cursor/plans/backend_native_api_整合_9545f4b9.plan.md`](../.cursor/plans/backend_native_api_整合_9545f4b9.plan.md)  
> **第二期报告：** [`acceptance-reports/S8-phase2-2026-07-14.md`](acceptance-reports/S8-phase2-2026-07-14.md)

### S8-1 前置 INFRA（INFRA-A + INFRA-B + INFRA-C）

| 检查项 | 通过 |
|--------|------|
| `native-runtime.js` 存在；dev UI 仍可启动环境 | ☑ |
| `launchBrowser` 返回 `debuggingPort` | ☑ |
| `stopBrowser(envId)` 可 kill 并触发 pack 钩子 | ☑ |
| 种子 api-key；无 key → 401 | ☑ |
| `curl :9000/api/getBrowserList` 可达 | ☑ |

### S8-2 第一期 8 API（详见 COMPAT_API.md）

| 检查项 | 通过 |
|--------|------|
| API-01 getBrowserList GET+POST + RBAC | ☑ |
| API-02 addBrowser → virtual.dat 存在 | ☑ |
| API-03 updateBrowser | ☑ |
| API-04 deleteBrowser | ☑ |
| API-05 launchBrowser → CDP / E2E curl 全链 | ☑ |
| API-06 **stopBrowser**（非 closeBrowser） | ☑ |
| API-07 getBrowserRunningList | ☑ |
| API-08 getCrxList | ☑ |

> API-05：`automation/test-api.js` 在 Agent-S8 环境通过；E2E-2026-07-12 对新建 env 全链通过（历史 env id=1 偶发 CDP 超时，见 bugfix-cdp）。

### S8-3 第二期 11 API（API-09–19，2026-07-14）

| 检查项 | 通过 |
|--------|------|
| API-09 getBrowserFullParameters | ☑ |
| API-10 isBrowserRunning（bare boolean） | ☑ |
| API-11 deleteBrowserData | ☑ |
| API-12 clearCache | ☑ |
| API-13–16 分组 CRUD | ☑ |
| API-17 deleteCrx | ☑ |
| API-18 randomizeFingerprint | ☑ |
| API-19 addCrx（base64/路径；storeUrl blocked） | ☑ |

> 验收脚本：`server-backend/scripts/s8-phase2-smoke.js`；明细见 COMPAT_API §第二期验收记录。

### S8-4 第三期 Cookie（未开始）

| 检查项 | 通过 |
|--------|------|
| API-20 getCookie | ☐ |
| API-21 updateCookie | ☐ |

**S8 阶段结论：** ☐ 完全通过 · ☐ 未通过 · ☑ **第一期+第二期通过**（Cookie 第三期未做）

> **2026-07-11** Agent-S8：INFRA + API-01..08  
> **2026-07-12** Agent-E2E：add→launch→stop 全链  
> **2026-07-14** Agent-S8：API-09..19 + smoke 脚本  
> **2026-07-18** doc：ACCEPTANCE / 报告索引与 S8-phase2 对齐  

---

## 归档：重复 S3 节（已合并至上文 S3）

---



## 验收问题记录


| 日期         | 阶段  | 现象                               | 处理                                                                    | 复验    |
| ---------- | --- | -------------------------------- | --------------------------------------------------------------------- | ----- |
| 2026-07-04 | S1  | 登录 `timeout of 10000ms exceeded` | mock-server 对 `/dev-api` 跳过 bodyParser；vue.config proxy 整段 `/dev-api` | ☑     |
| 2026-07-05 | 启动  | backend `AuthGuard` 依赖注入失败       | `EnvironmentsModule` 增加 `imports: [AuthModule]`                       | ☑     |
| 2026-07-05 | 启动  | frontend ESLint prettier 报错      | `npm run lint -- --fix`                                               | ☑     |
| 2026-07-05 | S1  | **界面无退出登录**                      | Navbar 用户下拉 `v-if="false"` → 恢复用户名 + 退出                               | ☑     |
| 2026-07-05 | S1  | S1 全项验收                          | 验收人确认基本正常                                                             | ☑ 通过 |


---



## 验收人填写说明

1. 每完成一项，将表格中 `☐` 改为 `☑`
2. 某阶段全部必选项通过后，将该阶段 **阶段结论** 改为 ✅ 通过
3. 新问题追加到 **验收问题记录** 表
4. 更新本文 **最后更新** 日期与 **总进度一览**

---



## 相关文档

- [AGENT_COORDINATION.md](AGENT_COORDINATION.md) — Multitask 认领
- [acceptance-reports/README.md](acceptance-reports/README.md) — 验收报告索引
- [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md) — 标准可交付清单
- [INTEGRATION.md](INTEGRATION.md) — 跨模块衔接
- [COMPAT_API.md](COMPAT_API.md) — S8 逐 API
- [modules/08-compat-api.md](modules/08-compat-api.md) — 模块 08 索引

