# desktop-shell — VirtualBrowser 客户端 Electron 壳

二开 Electron 桌面窗口，加载 `server/dist/server/index.html`，通过 preload 注入 `chrome.send`，主进程委托 [`server/lib/native-runtime.js`](../server/lib/native-runtime.js)。

## 架构

```
Vue UI (dist/server)
  └─ chrome.send(name, [callback, ...params])
       └─ preload.js → ipcMain 'native-call'
            └─ native-ipc.js → nativeRuntime.handleNativeCall()
                 └─ VirtualBrowser.exe（指纹内核）
```

## 前置条件

- Node.js 18+
- 已构建管理 UI：`cd server && npm run build`（输出 `server/dist/server/`）
- 可选：`config/client.json` 或 `packaging/config/client.json`（云端 API 基址，由打包脚本注入）

## 开发验证

```powershell
cd D:\bytesio\VirtualBrowser\desktop-shell
npm install
npm run smoke
npm run start
```

`npm run smoke` 不启动 Electron 窗口，仅验证对 `native-runtime.js` 的 import 与 IPC 桥接函数。

## 生产安装包

见 [`packaging/README.md`](../packaging/README.md) 与 `packaging/scripts/build-client.ps1`。

## 约束

- **禁止** 复制或重写 `native-runtime.js` 内部逻辑
- **禁止** 恢复原厂 `app.asar`
- 仅通过 `require('../../server/lib/native-runtime')` 调用原生能力
