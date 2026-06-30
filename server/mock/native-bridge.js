const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const repoRoot = path.join(__dirname, '../..')
const pathsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/chrome-bin.paths.json'), 'utf8')
)

const innerExe = path.join(repoRoot, pathsConfig.innerExe.replace(/\//g, path.sep))
const vbRoot = path.join(process.env.LOCALAPPDATA || '', 'VirtualBrowser')
const workersRoot = path.join(vbRoot, 'Workers')
const userDataFile = path.join(vbRoot, 'User Data', 'global.dat')
const listFile = path.join(vbRoot, 'User Data', 'browser-list.json')

/** @type {Map<string, import('child_process').ChildProcess>} */
const running = new Map()

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function syncWorkerProfiles(data) {
  const users = (data && data.users) || []
  ensureDir(workersRoot)
  for (const item of users) {
    const workerDir = path.join(workersRoot, String(item.id))
    ensureDir(workerDir)
    writeJson(path.join(workerDir, 'virtual.dat'), { users: [item] })
  }
}

function getRunningIds() {
  const ids = []
  for (const [id, proc] of running.entries()) {
    if (proc.exitCode == null && !proc.killed) ids.push(id)
    else running.delete(id)
  }
  return ids
}

function handleNativeCall(name, params = []) {
  switch (name) {
    case 'getBrowserList': {
      const data = readJson(listFile, { users: [] })
      return { data }
    }
    case 'setBrowserList': {
      const data = params[0] || { users: [] }
      writeJson(listFile, data)
      syncWorkerProfiles(data)
      return { ok: true }
    }
    case 'getGlobalData': {
      const raw = fs.existsSync(userDataFile)
        ? fs.readFileSync(userDataFile, 'utf8')
        : '{}'
      return { data: raw }
    }
    case 'setGlobalData': {
      ensureDir(path.dirname(userDataFile))
      fs.writeFileSync(userDataFile, params[0] || '{}', 'utf8')
      return { ok: true }
    }
    case 'deleteBrowser': {
      const id = String(params[0])
      const proc = running.get(id)
      if (proc && proc.exitCode == null) {
        proc.kill()
      }
      running.delete(id)
      return { ok: true }
    }
    case 'getRuningBrowser':
      return getRunningIds()
    case 'getBrowserVersion':
      return pathsConfig.chromeVersion || '146.0.7680.72'
    case 'launchBrowser': {
      const id = String(params[0])
      if (!fs.existsSync(innerExe)) {
        throw new Error(`内核不存在: ${innerExe}，请安装 Chrome-bin`)
      }
      const workerDir = path.join(workersRoot, id)
      ensureDir(workerDir)
      if (!fs.existsSync(path.join(workerDir, 'virtual.dat'))) {
        writeJson(path.join(workerDir, 'virtual.dat'), { users: [] })
      }
      const proc = spawn(
        innerExe,
        [`--worker-id=${id}`, `--user-data-dir=${workerDir}`],
        { detached: true, stdio: 'ignore', windowsHide: false }
      )
      proc.unref()
      running.set(id, proc)
      proc.on('exit', () => running.delete(id))
      console.log('[dev-native-bridge] launchBrowser id=', id)
      return { ok: true }
    }
    case 'checkProxy':
      console.warn('[dev-native-bridge] checkProxy not implemented')
      return false
    default:
      console.warn('[dev-native-bridge] unhandled:', name, params)
      return null
  }
}

module.exports = function registerNativeBridge(app) {
  app.post('/dev-native-bridge', (req, res) => {
    try {
      const { name, params } = req.body || {}
      if (!name) {
        res.status(400).send('missing name')
        return
      }
      const result = handleNativeCall(name, params)
      res.json(result)
    } catch (err) {
      console.error('[dev-native-bridge]', err)
      res.status(500).send(err.message || String(err))
    }
  })

  console.log('')
  console.log('  [dev-native-bridge] localhost 二开模式已启用')
  console.log('  UI: npm run dev  →  http://localhost:9527')
  console.log('  native 走 Node 桥接，launchBrowser 调用真实内核')
  console.log(`  内核: ${innerExe}`)
  console.log('')
}
