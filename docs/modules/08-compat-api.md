# 模块 08 — Compat REST API（Apifox 协议）

> **状态：** 🟢 第一期 done（INFRA + API-01–08）；第二期 pending  
> **验收阶段：** **S8** 🟡 基本通过（见 [`ACCEPTANCE.md`](../ACCEPTANCE.md) §S8）  
> **任务真相：** [`COMPAT_API.md`](../COMPAT_API.md)（逐行 pending/done/blocked）  
> **执行计划：** [`.cursor/plans/backend_native_api_整合_9545f4b9.plan.md`](../../.cursor/plans/backend_native_api_整合_9545f4b9.plan.md)  
> **最后更新：** 2026-07-14

## 1. 目标与边界

**负责：**

- 在 `server-backend` 暴露 Apifox 兼容 REST（`:9000`，`api-key` 鉴权）
- 第一期 8 个核心 API（getBrowserList … getCrxList）
- 共享 `server/lib/native-runtime.js`（与 dev-bridge、desktop-shell 共用）

**不负责：**

- 管理 UI 登录 Bearer 流程（见模块 02）
- 客户端安装包（S7）
- 商店在线安装 CRX、账号密码 REST（见 COMPAT_API blocked 表）

## 2. 与其他轨道的关系

| 轨道 | 关系 |
|------|------|
| S7 客户端 | 共享 INFRA-A；Compat 不要求安装包完成 |
| S6 云端 | 生产可选暴露 `:9000`（Nginx）；首期与内核同机 |
| dev 路线 B | Infra-A 完成后 dev-bridge 改薄封装 |

## 3. 进度摘要（镜像 COMPAT_API.md）

| 阶段 | done | pending |
|------|------|---------|
| INFRA-A/B/C | 11 | 0 |
| 第一期 API-01–08 | 8 | 0 |
| 第二期 API-09–19 | 0 | 11 |
| blocked | — | 7 项明确不做 |

## 4. 关键文件（实现时创建）

见 [`COMPAT_API.md`](../COMPAT_API.md) §关键源码索引。

## 5. Agent 协作

- 认领：[`AGENT_COORDINATION.md`](../AGENT_COORDINATION.md) — 仅 **Agent-S8** 改 `COMPAT_API.md` 状态行
- 验收报告：`acceptance-reports/S8-*.md`

## 6. 关联模块

- [00-native-bridge](00-native-bridge.md) — native 能力清单  
- [07-backend-stack](07-backend-stack.md) — Nest + 双模式存储  
- [INTEGRATION §Compat](../INTEGRATION.md) — 跨模块衔接  
