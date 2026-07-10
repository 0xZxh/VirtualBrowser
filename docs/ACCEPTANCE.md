# 分阶段验收记录

> **最后更新：** 2026-07-07（S2/S3 通过，S4 待验收，S5 开发完成待验收）
> **交付基线：** [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md)  
> **用途：** 各阶段验收步骤 + 验收人勾选进度 + 问题记录

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
| **S4** | 同步状态 UI + 立即同步       | 🟡 **待验收** | 2026-07-07 开发完成 |
| **S5** | CRX 绑定 + launch 注入   | 🟡 **待验收** | 2026-07-07 开发完成 |
| **S6** | 生产部署                 | ⬜ 未开始      | —                           |


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
| 列表显示同步状态 | ☐ |
| 手动上传成功 | ☐ |
| 手动拉取成功 | ☐ |
| viewer 无同步按钮 | ☐ |

**S4 阶段结论：** ☐ 通过 · ☐ 未通过 · ☑ 待验收

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
| 环境表单可绑定插件 | ☐ |
| 保存后 crx-list 绑定正确 | ☐ |
| launchBrowser 加载扩展 | ☐ |
| viewer 无插件上传/删除 | ☐ |

**S5 阶段结论：** ☐ 通过 · ☐ 未通过 · ☑ 待验收

---

## S3 — 登录 token 云同步（2.7、5.9）（归档）

---

## S6 — 生产部署（6.1–6.9）⬜ 未开发


| 检查项            | 通过  |
| -------------- | --- |
| 生产构建与托管文档可重复安装 | ☐   |


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

- [DELIVERY_STANDARD.md](DELIVERY_STANDARD.md) — 标准可交付清单
- [INTEGRATION.md](INTEGRATION.md) — 跨模块衔接
- [modules/02-auth-login.md](modules/02-auth-login.md) — 登录与用户管理
- [modules/03-rbac-permissions.md](modules/03-rbac-permissions.md) — RBAC 与环境隔离
- [modules/05-profile-cloud-sync.md](modules/05-profile-cloud-sync.md) — 云同步

