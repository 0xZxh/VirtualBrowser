const fs = require('fs')
const path = require('path')
const { app, BrowserWindow, ipcMain } = require('electron')
const { handleNativeIpc, nativeRuntime } = require('./native-ipc')
const { appRoot } = require('./paths')

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
  console.log('[desktop-shell] appRoot=', appRoot)
  console.log('[desktop-shell] UI index=', resolveUiIndex())
  console.log('[desktop-shell] cloudApiBase=', clientConfig.cloudApiBase || '(未配置 client.json)')
  console.log('[desktop-shell] native innerExe=', nativeRuntime.innerExe)

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
