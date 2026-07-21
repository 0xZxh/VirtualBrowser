# E2E-2 Multitask 提示词（可直接粘贴）

> **用法：** Cursor Multitask 新建 **1 个** Agent，整段复制下方「提示词正文」。  
> **前置：** Setup.exe 已存在；`config/client.json` 的 `cloudApiBase` 已为 `http://120.78.76.171:3001`（若 Setup 仍是旧包，先重打）。  
> **认领：** `docs/AGENT_COORDINATION.md` → **E2E-2**

---

## 提示词正文

```text
你是 Agent-E2E-2，负责客户交付路径端到端验收（Setup 实机 + API）。

【认领】
1. 打开 docs/AGENT_COORDINATION.md，将 E2E-2 认领为 in_progress（今天日期）
2. 先读：
   - docs/ACCEPTANCE.md §S6 / §S7 / §S8 总进度
   - docs/acceptance-reports/E2E-2026-07-12.md（上一轮阻塞）
   - docs/acceptance-reports/S7-build-2026-07-14.md
   - config/client.json（cloudApiBase 应为 http://120.78.76.171:3001）
   - docs/CLOUD_DEPLOY.md §0「当前部署地址」

【前置检查（写进报告）】
A. Test-Path packaging/output/VirtualBrowser-Setup-0.1.0.exe
B. Get-Content config/client.json —— cloudApiBase 是否为 http://120.78.76.171:3001
C. 若 Setup 内嵌仍是 127.0.0.1：先执行
   $env:Path = "D:\NSIS;" + $env:Path
   cd packaging/scripts
   .\build-client.ps1 -CloudApiBase "http://120.78.76.171:3001"
   （可 -SkipUiBuild 若 dist 已新）
D. 探测服务端：
   curl.exe -s http://120.78.76.171:3001/health
   若失败：标 blocked，写清防火墙/进程未启动，不要假通过

【任务 — 按序验收】
1. 安装 Setup.exe（或从 staging 启动 desktop-shell，若无法静默安装则说明并改测 smoke + 手动步骤）
2. 桌面窗口启动（非系统浏览器标签页）
3. 登录云端 API：admin / admin123（基址 120.78.76.171:3001）
4. 创建环境 → 启动 → 指纹窗口弹出
5. Compat（若同机有内核）：
   - 有 api-key 时：addBrowser → launchBrowser → stopBrowser
   - 远程仅 API、本机无内核：在报告注明「Compat launch 需与内核同机，本轮仅测 :3001」
6. 写 docs/acceptance-reports/E2E-2-日期.md（用 TEMPLATE.md；命令+实际输出必填）
7. 更新 ACCEPTANCE.md §S6/S7 检查项与阶段结论（能确认的 ☑；不能确认的保持 ☐ 并说明）
8. AGENT_COORDINATION E2E-2 → done 或 blocked（写原因）
9. 更新 docs/acceptance-reports/README.md 索引

【禁止】
- 不要虚假标「完全通过」
- 不要改 server-backend 业务逻辑（本轮只验收；修阻塞仅限文档/配置/明确的安装脚本）
- 不懂标 blocked 问用户（尤其：服务器未部署、3001 不通、无 NSIS）

【交付给我】
- E2E-2 报告路径
- Setup 是否用 120.78.76.171 重打
- health / 登录 / 启动指纹三项结果表
- 仍 blocked 的清单

中文回复。
```

---

## 你开跑前可先自检（30 秒）

```powershell
curl.exe -s http://120.78.76.171:3001/health
Test-Path D:\bytesio\VirtualBrowser\packaging\output\VirtualBrowser-Setup-0.1.0.exe
Get-Content D:\bytesio\VirtualBrowser\config\client.json
```

`health` 不通时，先在服务器按 `docs/CLOUD_DEPLOY.md` 起 `server-backend` 并放行 **TCP 3001**，再开 E2E-2 Agent。
