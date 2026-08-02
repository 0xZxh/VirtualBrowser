const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { handleNativeIpc, nativeRuntime } = require('./native-ipc')
const { appRoot } = require('./paths')
const { getLogsDir } = require(path.join(appRoot, 'config/vb-paths'))
const {
  logDesktop,
  errorDesktop,
  ensureLogsDir,
  packLogsZip
} = require(path.join(appRoot, 'server/lib/file-logger'))

function readClientConfig() {
  const candidates = [
    path.join(appRoot, 'config/client.json'),
    path.join(appRoot, 'packaging/config/client.json')
  ]
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      try {
        // PowerShell Set-Content -Encoding UTF8 会写 BOM，需剥离否则 JSON.parse 失败
        const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
        return JSON.parse(raw)
      } catch (err) {
        console.warn('[desktop-shell] invalid client.json:', file, err.message)
        errorDesktop('invalid client.json', { file, error: err.message })
      }
    }
  }
  return {}
}

function resolveUiIndex() {
  const candidates = [
    path.join(appRoot, 'dist/server/index.html'),
    path.join(appRoot, 'server/dist/server/index.html')
  ]
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file
    }
  }
  return candidates[candidates.length - 1]
}

/** @type {BrowserWindow | null} */
let mainWindow = null

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, '../assets/app.ico'),
    path.join(appRoot, 'packaging/assets/app.ico'),
    path.join(appRoot, 'assets/app.ico'),
    path.join(appRoot, 'resources/app/assets/app.ico')
  ]
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file
    }
  }
  return undefined
}

function createWindow() {
  const clientConfig = readClientConfig()
  const indexHtml = resolveUiIndex()
  const appIcon = resolveAppIcon()

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    show: false,
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow && mainWindow.show()
  })

  mainWindow.loadFile(indexHtml).catch(err => {
    console.error('[desktop-shell] loadFile failed:', indexHtml, err.message)
    errorDesktop('loadFile failed', { indexHtml, error: err.message })
  })

  if (clientConfig.windowTitle) {
    mainWindow.setTitle(clientConfig.windowTitle)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

ipcMain.handle('native-call', async (_event, payload) => {
  return handleNativeIpc(payload)
})

ipcMain.handle('desktop-open-external', async (_event, url) => {
  if (!url || typeof url !== 'string') {
    throw new Error('openExternal: invalid url')
  }
  await shell.openExternal(url)
  return { ok: true }
})

ipcMain.handle('desktop-open-log-folder', async () => {
  const dir = ensureLogsDir()
  const err = await shell.openPath(dir)
  if (err) {
    throw new Error(err)
  }
  return { ok: true, path: dir }
})

ipcMain.handle('desktop-download-logs', async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const defaultName = `xianfu-logs-${stamp}.zip`
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
  const save = await dialog.showSaveDialog(win, {
    title: '下载日志包',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'Zip', extensions: ['zip'] }]
  })
  if (save.canceled || !save.filePath) {
    return { ok: false, canceled: true }
  }
  const packed = packLogsZip(save.filePath)
  logDesktop('logs zip saved', { path: packed.path, files: packed.files })
  return { ok: true, path: packed.path, files: packed.files }
})

ipcMain.handle('desktop-open-devtools', async () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('主窗口不可用')
  }
  mainWindow.webContents.openDevTools({ mode: 'detach' })
  return { ok: true }
})

function notifyBrowserExited(envId) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('browser-exited', { envId: String(envId) })
  }
}

app.whenReady().then(() => {
  const clientConfig = readClientConfig()
  if (clientConfig.cloudApiBase) {
    process.env.CLOUD_API_BASE = String(clientConfig.cloudApiBase).replace(/\/$/, '')
  }
  try {
    ensureLogsDir()
  } catch (err) {
    console.warn('[desktop-shell] ensureLogsDir failed:', err.message)
  }
  console.log('[desktop-shell] appRoot=', appRoot)
  console.log('[desktop-shell] UI index=', resolveUiIndex())
  console.log('[desktop-shell] cloudApiBase=', clientConfig.cloudApiBase || '(未配置 client.json)')
  console.log('[desktop-shell] native innerExe=', nativeRuntime.innerExe)
  console.log('[desktop-shell] logsDir=', getLogsDir())
  logDesktop('app ready', {
    appRoot,
    uiIndex: resolveUiIndex(),
    cloudApiBase: clientConfig.cloudApiBase || null,
    logsDir: getLogsDir()
  })

  if (typeof nativeRuntime.setBrowserExitListener === 'function') {
    nativeRuntime.setBrowserExitListener(notifyBrowserExited)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 退出管理端时清扫指纹内核树，避免任务管理器里残留 Virtual Browser
app.on('before-quit', () => {
  try {
    if (typeof nativeRuntime.stopAllBrowsers === 'function') {
      const result = nativeRuntime.stopAllBrowsers()
      logDesktop('stopAllBrowsers on quit', result)
    } else if (typeof nativeRuntime.killAllWorkerKernels === 'function') {
      const result = nativeRuntime.killAllWorkerKernels()
      logDesktop('killAllWorkerKernels on quit', result)
    }
  } catch (err) {
    console.warn('[desktop-shell] cleanup kernels on quit failed:', err.message)
    errorDesktop('cleanup kernels on quit failed', { error: err.message })
  }
})
