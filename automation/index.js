const { chromium } = require('playwright')

// Paths: config/chrome-bin.paths.json
const INNER_EXE =
  'D:\\bytesio\\VirtualBrowser\\Chrome-bin\\VirtualBrowser\\146.0.7680.72\\VirtualBrowser.exe'

;(async () => {
  // worker-id 需要先在外层管理壳里手动创建
  const workerId = 1

  const browser = await chromium.launchPersistentContext(
    `${process.env.localappdata}\\VirtualBrowser\\Workers\\${workerId}`,
    {
      // 内层 Chromium 启动器（指纹内核，非外层 Electron 管理壳）
      executablePath: INNER_EXE,
      args: [`--worker-id=${workerId}`],
      headless: false,
      defaultViewport: null,
    }
  )

  const page = await browser.newPage()
  await page.goto('http://example.com')
  // other actions...
  // await browser.close()
})()
