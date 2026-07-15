# VirtualBrowser - automation

## Project setup

```
npm install
```

### Start automation

```
npm test
```

可选环境变量：

| 变量 | 说明 |
|------|------|
| `VB_WORKER_ID` | 环境 id（默认 `1`） |
| `VB_INNER_EXE` | 内核 exe 绝对路径；默认读 `config/chrome-bin.paths.json` |
| `VB_DATA_ROOT` | 覆盖 Workers 等数据根（见 `config/vb-paths.js`） |

Workers 路径由 `config/vb-paths.js` 按宿主机解析（Windows / macOS / Linux）。  
**说明：** 当前指纹内核 `VirtualBrowser.exe` 仍为 Windows 交付；Mac/Linux 上无法启动内核，但路径 API 与 UI 指纹伪装已就绪。

### Demo Code (nodejs playwright)

```javascript
const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const { getWorkerDir } = require('../config/vb-paths')

const workerId = 1 // 需先在管理端创建
const repoRoot = path.join(__dirname, '..')
const pathsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/chrome-bin.paths.json'), 'utf8')
)
const executablePath = path.join(repoRoot, pathsConfig.innerExe.replace(/\//g, path.sep))

const browser = await chromium.launchPersistentContext(getWorkerDir(workerId), {
  executablePath,
  args: [`--worker-id=${workerId}`],
  headless: false,
  defaultViewport: null
})
```

### API + CDP（Compat :9000）

见 `test-api.js` / `test-api.py` 与 [`docs/COMPAT_API.md`](../docs/COMPAT_API.md)。
