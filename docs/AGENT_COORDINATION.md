# 多 Agent 协作协调表

> **最后更新：** 2026-07-19；sync-timeout-cookie Setup 0.1.6（排除 Cache、同步 300s、CDP Cookie 注入）；repack-014 Setup 0.1.4 已出包。  
> **用途：** Multitask 多 Agent 并行时的任务认领、文件所有权、阻塞登记。  
> **Multitask 开工先读本文**，再读 [`ACCEPTANCE.md`](ACCEPTANCE.md) 总进度 + [`PROJECT_PROGRESS.md`](../PROJECT_PROGRESS.md)。

---

## G0 门禁（批次 0）

| 项 | 状态 |
|----|------|
| 文档同步（批次 0） | ✅ **done**（2026-07-11） |
| 其他 Agent 改代码 | 🟢 **已放行**（认领后按所有权表执行） |

---

## 三轨目标（勿偏离）

| 轨道 | 验收阶段 | 任务真相文档 | 执行计划 |
|------|----------|--------------|----------|
| A — 管理 UI | S1–S7 | [`ACCEPTANCE.md`](ACCEPTANCE.md) | 各 `modules/XX` |
| B — 云端 | S6 | [`CLOUD_DEPLOY.md`](CLOUD_DEPLOY.md) | 安装包计划 §S6 |
| C — COMPAT API | S8 | [`COMPAT_API.md`](COMPAT_API.md) | [`backend_native_api_整合`](../.cursor/plans/backend_native_api_整合_9545f4b9.plan.md) |

**共享阻塞项：** `INFRA-A`（`server/lib/native-runtime.js`）— **全项目仅 1 个 Agent**，完成后 S7 + S8 才能改 `server/lib/*`。

---

## 任务认领表

状态：`unclaimed` | `in_progress` | `done` | `blocked`

| 任务 ID | 描述 | 认领 Agent | 开始日期 | 状态 | 阻塞/备注 |
|---------|------|------------|----------|------|-----------|
| **doc-sync** | 批次 0 文档同步 | Agent-Doc | 2026-07-11 | **done** | 见 `acceptance-reports/doc-sync-2026-07-11.md` |
| **INFRA-A** | 抽离 `native-runtime.js` | Agent-Infra-A | 2026-07-11 | **done** | 见 [`acceptance-reports/INFRA-A-2026-07-11.md`](acceptance-reports/INFRA-A-2026-07-11.md) |
| **INFRA-B** | api-key + ApiKeyGuard | Agent-S8 | 2026-07-11 | **done** | 见 [`COMPAT_API.md`](COMPAT_API.md) §INFRA-B |
| **INFRA-C** | BrowserModule + :9000 | Agent-S8 | 2026-07-11 | **done** | 见 [`COMPAT_API.md`](COMPAT_API.md) §INFRA-C |
| **S4-verify** | S4 同步 UI 验收 | Agent-Verify | 2026-07-11 | **done** | [`acceptance-reports/S4-2026-07-11.md`](acceptance-reports/S4-2026-07-11.md) |
| **S5-verify** | S5 CRX 注入验收 | Agent-Verify | 2026-07-11 | **done** | [`acceptance-reports/S5-2026-07-11.md`](acceptance-reports/S5-2026-07-11.md) |
| **S6-cloud** | 云端部署 + CLOUD_DEPLOY.md | Agent-S6 | 2026-07-11 | **done** | 见 [`acceptance-reports/S6-2026-07-11.md`](acceptance-reports/S6-2026-07-11.md) |
| **S7-client** | desktop-shell + NSIS | Agent-S7 | 2026-07-11 | **done** | 见 [`acceptance-reports/S7-2026-07-11.md`](acceptance-reports/S7-2026-07-11.md) |
| **S8-API-01..08** | Compat 第一期 8 API | Agent-S8 | 2026-07-11 | **done** | 见 [`COMPAT_API.md`](COMPAT_API.md) §API-01..08；`automation/test-api.js` 已通过 |
| **E2E** | S6+S7+S8 联调验收 | Agent-E2E | 2026-07-12 | **done** | 见 [`acceptance-reports/E2E-2026-07-12.md`](acceptance-reports/E2E-2026-07-12.md)；Setup.exe 阻塞 NSIS+Electron |
| **S7-build** | 打通 NSIS+Electron 安装包阻塞 | Agent-S7-Build | 2026-07-14 | **done** | Setup=`packaging/output/VirtualBrowser-Setup-0.1.0.exe`；已补 staging `adm-zip`（2026-07-14）；CloudApiBase=`http://127.0.0.1:3001`；见 [`acceptance-reports/S7-build-2026-07-14.md`](acceptance-reports/S7-build-2026-07-14.md) |
| **S6-prod** | S6 生产环境实机验收（Mongo + API） | Agent-S6-Prod | 2026-07-12 | **done** | 见 [`acceptance-reports/S6-prod-2026-07-12.md`](acceptance-reports/S6-prod-2026-07-12.md)；HTTP mongo 通过，HTTPS 待运维 |
| **doc-sync-2** | 进度文档与 ACCEPTANCE 对齐 | Agent-Doc | 2026-07-14 | **done** | 见 [`acceptance-reports/doc-sync-2-2026-07-14.md`](acceptance-reports/doc-sync-2-2026-07-14.md) |
| **E2E-2** | Setup 实机 + 生产路径联调 | Agent-E2E-2 | 2026-07-18 | **done** | 部分通过；见 [`acceptance-reports/E2E-2-2026-07-18.md`](acceptance-reports/E2E-2-2026-07-18.md)；HTTPS / Compat 远程 launch 仍 blocked |
| **taskbar-icons** | FP 品牌 app.ico + 壳/内核 rcedit + NSIS/BrowserWindow | Agent-Icons | 2026-07-19 | **done** | `packaging/assets/app.ico`；`build-client.ps1` rcedit 双 EXE；NSIS MUI_ICON；已随 repack-014 出包 |
| **repack-014** | 重打 Setup 0.1.4（图标+设置修复入包） | Agent-Pack | 2026-07-19 | **done** | Setup=`packaging/output/VirtualBrowser-Setup-0.1.4.exe`（~464MB）；CloudApiBase=`http://120.78.76.171:3001`；staging=`packaging/staging-20260719160340`（主 staging 被锁）；rcedit 壳+内核 ok |
| **sync-timeout-cookie** | 云同步排除 Cache；超时 300s；UI 说明范围；launch CDP Cookie 注入；Setup 0.1.6 | Agent-Sync | 2026-07-19 | **done** | `profile-sync` 去掉 Cache/Code Cache；`native.js`/`cloud-sync` 300s；`cdp-navigate.injectCookies`；Setup=`packaging/output/VirtualBrowser-Setup-0.1.6.exe` |
| **bugfix-cdp** | 历史 env launch CDP 偶发超时 | — | — | **unclaimed** | 见 E2E-2026-07-12 |
| **fix-settings-gaps** | cookie jsonStr/value、GetAPIProxy await、checkProxy 基础实现 | Agent-Settings | 2026-07-19 | **done** | cookie/GetAPIProxy/checkProxy；见 fingerprint 报告 |
| **fingerprint-probe** | CDP 指纹门禁脚本 + acceptance 报告 | Agent-Settings | 2026-07-19 | **done** | [`acceptance-reports/fingerprint-settings-2026-07-19.md`](acceptance-reports/fingerprint-settings-2026-07-19.md) 门禁全绿 |
| **S8-phase2** | Compat API-09+ | Agent-S8 | 2026-07-14 | **done** | API-09..19；见 [`COMPAT_API.md`](COMPAT_API.md) §第二期验收 |
| **defer-ip-geo** | 自建 IP 查询（不调第三方） | Agent-IpGeo | 2026-07-19 | **done** | `GET /api/ip-geo` + MMDB + 管理端「自建」渠道；部署见 [`CLOUD_DEPLOY.md`](CLOUD_DEPLOY.md) §4.6 |
| **cross-platform-prep** | 数据路径抽象 + 指纹 OS(Mac/Linux UA) + worker/automation 跨平台 | Agent-XP | 2026-07-15 | **done** | `config/vb-paths.js`；内核 exe 仍 Windows-only（Mission） |

**认领规则：**

1. 将 `—` 改为你的 Agent 角色名 + 日期，状态改 `in_progress`
2. 完成时改 `done` 并链接 `acceptance-reports/{任务}-*.md`
3. `blocked` 必须写原因 + 已查文档；**禁止乱猜**

---

## 文件所有权（禁止并行改同一文件）

| 路径 | 唯一所有者 | 其他 Agent |
|------|------------|------------|
| `server/lib/native-runtime.js` | Agent-Infra-A | 只读；done 后 import |
| `server/mock/native-bridge.js` | Agent-Infra-A | 禁止并行修改 |
| `server-backend/src/browser/*` | Agent-S8 | 禁止 |
| `server-backend/src/api-keys/*` | Agent-S8 | 禁止 |
| `server-backend/src/main.ts`（CORS） | Agent-S6 | S8 不改 CORS |
| `desktop-shell/**` | Agent-S7 | 禁止 |
| `packaging/**` | Agent-S7 | 禁止 |
| `docs/COMPAT_API.md` 状态行 | Agent-S8 | 只读 |
| `docs/CLOUD_DEPLOY.md` | Agent-S6 | 禁止 |
| `docs/ACCEPTANCE.md` §Sx | 负责该阶段的 Agent | 只改自己节 |

---

## 推荐 Multitask 批次

```
批次 0–4 ✅ Doc → Verify → Infra-A → S8∥S7 → E2E
批次 5 ✅ S7-build（Setup.exe）∥ S6-prod（mongo HTTP）
批次 5b ✅ doc-sync-2（进度文档对齐）
批次 6 ✅ S8-phase2（API-09..19）
下一拨：E2E-2（Setup 实机）∥ 可选 bugfix-cdp / Cookie 第三期
再下一拨：生产 HTTPS + 重打 Setup（需用户提供域名）
✅ defer-ip-geo（自建 IP 查询）已落地 — 见 CLOUD_DEPLOY §4.6
```

---

## 不懂不乱猜 — 查阅顺序

1. [`PROJECT_PROGRESS.md`](../PROJECT_PROGRESS.md) §1 + §7  
2. [`ACCEPTANCE.md`](ACCEPTANCE.md) 总进度一览  
3. 对应 `modules/XX` 或 [`COMPAT_API.md`](COMPAT_API.md)  
4. [`INTEGRATION.md`](INTEGRATION.md)  
5. [`.cursor/plans/`](../.cursor/plans/) 相关计划  
6. 仍无答案 → 本表标 `blocked`，问用户  

---

## blocked 登记

| 日期 | 任务 | Agent | 原因 | 待用户确认 |
|------|------|-------|------|------------|
| 2026-07-11 | S5 chrome://extensions 目视 | Agent-Verify | 无法自动化操作 VirtualBrowser.exe 内核窗口 | 启动 envId=1，在指纹 Chrome 打开 `chrome://extensions` 确认扩展已加载 |
| 2026-07-18 | E2E-2 HTTPS | Agent-E2E-2 | 生产仍明文 HTTP `:3001` | 上 Nginx HTTPS 后复验 |
| 2026-07-18 | E2E-2 Compat 远程 | Agent-E2E-2 | addBrowser 500；launch 需同机内核 | 查服务器 Compat 日志；客户机本机 Compat 或接受仅管 API |

---

## 相关文档

- [`acceptance-reports/README.md`](acceptance-reports/README.md) — 各阶段验收报告索引  
- [`acceptance-reports/TEMPLATE.md`](acceptance-reports/TEMPLATE.md) — 验收报告模板  
- [`.cursor/plans/客户端安装包交付_33a8c0a6.plan.md`](../.cursor/plans/客户端安装包交付_33a8c0a6.plan.md) — 三轨 + Multitask 规范  
