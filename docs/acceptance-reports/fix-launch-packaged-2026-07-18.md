# 调试笔记 — 安装后指纹启动失败 — 2026-07-18

## 现象

打包安装 `VirtualBrowser-Setup` 后，管理台可打开、可登录云端，但点击「启动」无法弹出指纹浏览器。

## 根因（一句话）

Electron `contextIsolation` 下无法用 `contextBridge` 覆盖 Chromium 预置的 `window.chrome`，且 preload 无法回调页面 `window.cr`，导致 UI 的 `chrome.send('launchBrowser')` 在安装包内实际不可用。

## 次要问题（一并修）

1. `build-client.ps1` 用 PowerShell `Set-Content -Encoding UTF8` 写出带 **BOM** 的 `client.json`，`JSON.parse` 失败 → 日志显示「未配置 client.json」。
2. `cloud-sync.js` 在模块加载时固化 `CLOUD_API_BASE`（常为 localhost），且 `fetch` 无超时，可能拖死启动链路。

## 修复

| 文件 | 改动 |
|------|------|
| `desktop-shell/src/preload.js` | 暴露 `vbDesktop.invoke(name, params)` Promise API |
| `server/src/api/native.js` | 优先 `vbDesktop.invoke`，保留真实内核 `chrome.send` 兼容 |
| `server/src/api/native-bridge-client.js` | `isNativeBridgeAvailable` 识别 `vbDesktop.invoke` |
| `server/src/views/browser/index.vue` | `launchBrowser` 超时改为 120s，失败提示 |
| `desktop-shell/src/main.js` | 读 `client.json` 剥离 BOM；写入 `CLOUD_API_BASE` |
| `packaging/scripts/build-client.ps1` | `client.json` 写 UTF-8 **无 BOM** |
| `server/lib/cloud-sync.js` | 运行时读取 `CLOUD_API_BASE` + `fetch` 超时 |

## 验证（本机）

```powershell
# staging 热更新到安装目录后：
# vbDesktop.invoke('launchBrowser', ['1'])
# → {"ok":true,"debuggingPort":19200,"envId":"1"}
# netstat :19200 LISTENING；CDP Browser Chrome/146；Chrome-bin 进程存在
```

重打 Setup：`packaging/output/VirtualBrowser-Setup-0.1.0.exe`（含本修复）。

## 用户重装验证

1. 卸载旧版（或覆盖安装）`VirtualBrowser-Setup-0.1.0.exe`
2. 启动桌面客户端 → 登录 `admin` / `admin123`
3. 环境列表点「启动」→ 应弹出指纹 Chrome 窗口
4. 若仍失败：看主进程控制台是否有 `native-call failed` / `内核不存在`

关联：[`E2E-2-2026-07-18.md`](E2E-2-2026-07-18.md)（此前用 node 直调 native-runtime 通过，GUI `chrome.send` 路径当时未真正打通）。
