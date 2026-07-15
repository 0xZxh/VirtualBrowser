# VirtualBrowser paths (Route B)

## Layout

Only **inner kernel** is kept under `Chrome-bin/`:

```
Chrome-bin/VirtualBrowser/146.0.7680.72/
  VirtualBrowser.exe   <- launch fingerprint profile (Windows)
  chrome.dll
  worker/              <- deploy from worker/ npm run deploy:worker
```

No outer Electron shell. Management UI = open source `server/` + `npm run dev`.

## Data root（跨平台）

统一由 [`vb-paths.js`](./vb-paths.js) 解析：

| 宿主机 | 默认路径 |
|--------|----------|
| Windows | `%LOCALAPPDATA%/VirtualBrowser` |
| macOS | `~/Library/Application Support/VirtualBrowser` |
| Linux | `$XDG_DATA_HOME/VirtualBrowser` 或 `~/.local/share/VirtualBrowser` |

覆盖：`VB_DATA_ROOT=/custom/path`

## Dev

```powershell
cd server && npm run dev
```

- UI hot reload in browser
- native via `dev-native-bridge` (Node)
- `launchBrowser` spawns inner `VirtualBrowser.exe`（Windows）

## Worker deploy

```bash
cd worker && npm run deploy:worker   # Node，跨平台
# Windows 也可用：npm run deploy:worker:ps1
```

## Config

See `config/chrome-bin.paths.json`。
