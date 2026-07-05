const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const profileSync = require('../lib/profile-sync')
const cloudSync = require('../lib/cloud-sync')
const crxStore = require('../lib/crx-store')

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

/** launch 时缓存登录 token，供浏览器退出后 cloud upload 使用 */
/** @type {Map<string, string>} */
const cloudTokenByEnv = new Map()

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

function extractBearerToken(req) {
  const header = String(req.headers.authorization || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function getCloudToken(req) {
  const fromRequest = req && extractBearerToken(req)
  if (fromRequest) return fromRequest
  return process.env.CLOUD_API_TOKEN || ''
}

async function pullProfileIfNeeded(id, req) {
  const token = getCloudToken(req)
  if (!token) {
    console.log(
      '[dev-native-bridge] cloud pull skipped: 未登录且无 CLOUD_API_TOKEN（请先登录管理 UI）'
    )
    return
  }

  const workerDir = path.join(workersRoot, id)
  try {
    const decision = await cloudSync.shouldPullFromCloud(id, workerDir, token)
    if (!decision.pull) {
      console.log(
        '[dev-native-bridge] cloud pull: 本地已是最新 envId=',
        id,
        'reason=',
        decision.reason
      )
      return
    }

    console.log(
      '[dev-native-bridge] cloud pull: 开始下载 envId=',
      id,
      'reason=',
      decision.reason,
      'cloudVersion=',
      decision.cloudMeta && decision.cloudMeta.version
    )
    const result = await cloudSync.downloadSnapshot(id, workerDir, token)
    console.log(
      '[dev-native-bridge] cloud pull ok: envId=',
      id,
      'extracted=',
      result && result.extracted
    )
  } catch (err) {
    console.error('[dev-native-bridge] cloud pull failed:', err.message)
  }
}

async function uploadPackedSnapshot(id, zipPath, req) {
  const token = getCloudToken(req)
  if (!token) {
    console.log('[dev-native-bridge] cloud upload skipped: 未登录且无 CLOUD_API_TOKEN')
    return
  }

  try {
    const meta = await cloudSync.uploadSnapshot(id, zipPath, token)
    console.log(
      '[dev-native-bridge] cloud upload ok: envId=',
      id,
      'version=',
      meta.version,
      'size=',
      meta.size
    )
  } catch (err) {
    console.error('[dev-native-bridge] cloud upload failed:', err.message)
  }
}

async function handleNativeCall(name, params = [], req) {
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
    case 'packProfile': {
      const id = String(params[0])
      const workerDir = path.join(workersRoot, id)
      const outDir = profileSync.getSnapshotsDir(id)
      ensureDir(outDir)
      const outPath = path.join(outDir, `profile-${Date.now()}.zip`)
      return profileSync.packProfile(workerDir, { outputPath: outPath })
    }
    case 'unpackProfile': {
      const id = String(params[0])
      const zipPath = params[1]
      if (!zipPath) {
        throw new Error('unpackProfile 需要 zipPath 参数')
      }
      const workerDir = path.join(workersRoot, id)
      return profileSync.unpackProfile(workerDir, zipPath)
    }
    case 'getProfileLocalMeta': {
      const id = String(params[0])
      const workerDir = path.join(workersRoot, id)
      return profileSync.getProfileLocalMeta(workerDir)
    }
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
      const token = getCloudToken(req)
      if (token) {
        cloudTokenByEnv.set(id, token)
      }
      await pullProfileIfNeeded(id, req)
      const proc = spawn(
        innerExe,
        [`--worker-id=${id}`, `--user-data-dir=${workerDir}`],
        { detached: true, stdio: 'ignore', windowsHide: false }
      )
      proc.unref()
      running.set(id, proc)
      proc.on('exit', () => {
        running.delete(id)
        const exitToken = cloudTokenByEnv.get(id)
        cloudTokenByEnv.delete(id)
        const exitReq = exitToken
          ? { headers: { authorization: `Bearer ${exitToken}` } }
          : null
        ;(async () => {
          try {
            const outDir = profileSync.getSnapshotsDir(id)
            ensureDir(outDir)
            const outPath = path.join(outDir, `profile-${Date.now()}.zip`)
            const packed = profileSync.packProfile(workerDir, { outputPath: outPath })
            console.log(
              '[dev-native-bridge] profile auto-pack:',
              packed.path,
              'size=',
              packed.size
            )
            await uploadPackedSnapshot(id, packed.path, exitReq)
          } catch (err) {
            console.error('[dev-native-bridge] profile auto-pack failed:', err.message)
          }
        })()
      })
      console.log('[dev-native-bridge] launchBrowser id=', id)
      return { ok: true }
    }
    case 'getLocalCrxList':
    case 'getCrxList':
      return crxStore.getCrxList()
    case 'setCrxList': {
      const data = params[0] || { list: [] }
      return crxStore.setCrxList(data)
    }
    case 'addLocalCrx':
      return crxStore.addLocalCrx(params[0])
    case 'deleteLocalCrx':
      return crxStore.deleteLocalCrx(params[0])
    case 'enableLocalCrx':
      return crxStore.enableLocalCrx(params[0], params[1])
    case 'updateCrx':
      return crxStore.updateCrx(params[0])
    case 'getCrxEnvironments':
      return crxStore.getCrxEnvironments(params[0])
    case 'updateCrxEnvironments':
      return crxStore.updateCrxEnvironments(params[0], params[1])
    case 'checkProxy':
      console.warn('[dev-native-bridge] checkProxy not implemented')
      return false
    default:
      console.warn('[dev-native-bridge] unhandled:', name, params)
      return null
  }
}

module.exports = function registerNativeBridge(app) {
  app.post('/dev-native-bridge', async (req, res) => {
    try {
      const { name, params } = req.body || {}
      if (!name) {
        res.status(400).send('missing name')
        return
      }
      const result = await handleNativeCall(name, params, req)
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
  console.log(`  云同步: ${cloudSync.getCloudApiBase()}（登录 Bearer 自动；CLOUD_API_TOKEN 可选兜底）`)
  console.log('')
}
