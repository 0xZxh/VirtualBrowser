const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const { getWorkerDir } = require('../config/vb-paths')

const repoRoot = path.join(__dirname, '..')
const pathsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/chrome-bin.paths.json'), 'utf8')
)

const INNER_EXE =
  process.env.VB_INNER_EXE ||
  path.join(repoRoot, pathsConfig.innerExe.replace(/\//g, path.sep))

;(async () => {
  // worker-id 需要先在管理端手动创建
  const workerId = Number(process.env.VB_WORKER_ID || 1)
  const userDataDir = getWorkerDir(workerId)

  if (!fs.existsSync(INNER_EXE)) {
    console.error(
      'Inner kernel not found:',
      INNER_EXE,
      '\nHint: Windows-only VirtualBrowser.exe today; set VB_INNER_EXE if custom.'
    )
    process.exit(1)
  }

  const browser = await chromium.launchPersistentContext(userDataDir, {
    executablePath: INNER_EXE,
    args: [`--worker-id=${workerId}`],
    headless: false,
    defaultViewport: null
  })

  const page = await browser.newPage()
  await page.goto('http://example.com')
  // other actions...
  // await browser.close()
})()
