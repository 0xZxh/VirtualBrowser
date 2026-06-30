# VirtualBrowser - automation

## Project setup

```
npm install
```

### Start automation

```
npm test
```

### Demo Code (nodejs playwright)

```javascript
// worker-id 需先在外层管理界面创建环境
const workerId = 1

const browser = await chromium.launchPersistentContext(
  `${process.env.localappdata}\\VirtualBrowser\\Workers\\${workerId}`,
  {
    // 内层指纹内核（146.x），不是外层 Electron 管理壳
    executablePath:
      'D:\\bytesio\\VirtualBrowser\\Chrome-bin\\VirtualBrowser\\146.0.7680.72\\VirtualBrowser.exe',
    args: [`--worker-id=${workerId}`],
    headless: false,
    defaultViewport: null,
  }
)
```
