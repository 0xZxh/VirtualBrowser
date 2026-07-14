const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')
const profileSync = require('./profile-sync')
const cloudSync = require('./cloud-sync')
const crxStore = require('./crx-store')

const repoRoot = path.join(__dirname, '../..')
const pathsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/chrome-bin.paths.json'), 'utf8')
)

const innerExe = path.join(repoRoot, pathsConfig.innerExe.replace(/\//g, path.sep))
const vbRoot = path.join(process.env.LOCALAPPDATA || '', 'VirtualBrowser')
const workersRoot = path.join(vbRoot, 'Workers')
const userDataFile = path.join(vbRoot, 'User Data', 'global.dat')
const listFile = path.join(vbRoot, 'User Data', 'browser-list.json')

const DEBUG_PORT_MIN = 19200
const DEBUG_PORT_MAX = 19999

/** @type {Map<string, import('child_process').ChildProcess>} */
const running = new Map()

/** @type {Map<string, string>} */
const cloudTokenByEnv = new Map()

/** @type {Map<string, number>} */
const envDebugPorts = new Map()

/** @type {Set<number>} */
const allocatedDebugPorts = new Set()

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

function parseGlobalDataPayload(raw) {
  if (raw == null || raw === '') {
    return {}
  }
  let data = raw
  for (let i = 0; i < 3; i++) {
    if (typeof data !== 'string') {
      break
    }
    try {
      data = JSON.parse(data)
    } catch {
      return {}
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {}
  }
  return data
}

function readGlobalDataFile() {
  const raw = fs.existsSync(userDataFile) ? fs.readFileSync(userDataFile, 'utf8') : '{}'
  const data = parseGlobalDataPayload(raw)
  const normalized = JSON.stringify(data)
  if (raw.trim() && raw.trim() !== normalized) {
    ensureDir(path.dirname(userDataFile))
    fs.writeFileSync(userDataFile, normalized, 'utf8')
  }
  return data
}

function writeGlobalDataFile(payload) {
  const data = parseGlobalDataPayload(
    typeof payload === 'string' ? payload : JSON.stringify(payload || {})
  )
  ensureDir(path.dirname(userDataFile))
  fs.writeFileSync(userDataFile, JSON.stringify(data), 'utf8')
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

function allocateDebugPort() {
  for (let port = DEBUG_PORT_MIN; port <= DEBUG_PORT_MAX; port++) {
    if (!allocatedDebugPorts.has(port)) {
      allocatedDebugPorts.add(port)
      return port
    }
  }
  throw new Error(`无可用 debugging 端口（${DEBUG_PORT_MIN}-${DEBUG_PORT_MAX} 已耗尽）`)
}

function releaseDebugPort(port) {
  if (port != null) {
    allocatedDebugPorts.delete(port)
  }
}

function releaseDebugPortForEnv(envId) {
  const port = envDebugPorts.get(envId)
  if (port != null) {
    releaseDebugPort(port)
    envDebugPorts.delete(envId)
  }
}

async function pullProfileIfNeeded(id, req) {
  const token = getCloudToken(req)
  if (!token) {
    console.log(
      '[native-runtime] cloud pull skipped: 未登录且无 CLOUD_API_TOKEN（请先登录管理 UI）'
    )
    return
  }

  const workerDir = path.join(workersRoot, id)
  try {
    const decision = await cloudSync.shouldPullFromCloud(id, workerDir, token)
    if (!decision.pull) {
      console.log(
        '[native-runtime] cloud pull: 本地已是最新 envId=',
        id,
        'reason=',
        decision.reason
      )
      return
    }

    console.log(
      '[native-runtime] cloud pull: 开始下载 envId=',
      id,
      'reason=',
      decision.reason,
      'cloudVersion=',
      decision.cloudMeta && decision.cloudMeta.version
    )
    const result = await cloudSync.downloadSnapshot(id, workerDir, token)
    console.log(
      '[native-runtime] cloud pull ok: envId=',
      id,
      'extracted=',
      result && result.extracted
    )
  } catch (err) {
    console.error('[native-runtime] cloud pull failed:', err.message)
  }
}

async function uploadPackedSnapshot(id, zipPath, req) {
  const token = getCloudToken(req)
  if (!token) {
    throw new Error('未登录，无法上传云快照')
  }

  const meta = await cloudSync.uploadSnapshot(id, zipPath, token)
  console.log(
    '[native-runtime] cloud upload ok: envId=',
    id,
    'version=',
    meta.version,
    'size=',
    meta.size
  )
  return meta
}

async function getProfileSyncStatus(id, req) {
  const token = getCloudToken(req)
  const workerDir = path.join(workersRoot, id)
  const localMeta = profileSync.getProfileLocalMeta(workerDir)
  const localCloudMeta = cloudSync.readLocalCloudMeta(id)

  let cloudMeta = null
  let cloudError = null
  if (token) {
    try {
      cloudMeta = await cloudSync.getSnapshotMeta(id, token)
    } catch (err) {
      cloudError = err.message
    }
  } else {
    cloudError = '请先登录'
  }

  let status = 'unknown'
  if (!token) {
    status = 'no-auth'
  } else if (cloudError && !cloudMeta) {
    status = 'error'
  } else if (!cloudMeta) {
    status = localMeta.fileCount > 0 ? 'local-only' : 'no-cloud'
  } else if (!localMeta.fileCount && !localCloudMeta) {
    status = 'cloud-only'
  } else if (!localCloudMeta || localCloudMeta.version == null) {
    status = 'cloud-newer'
  } else if (cloudMeta.version > localCloudMeta.version) {
    status = 'cloud-newer'
  } else if (cloudMeta.version < localCloudMeta.version) {
    status = 'local-newer'
  } else {
    status = 'synced'
  }

  return {
    envId: id,
    localFileCount: localMeta.fileCount,
    localVersion: localCloudMeta && localCloudMeta.version != null ? localCloudMeta.version : null,
    localUpdatedAt: (localCloudMeta && localCloudMeta.updatedAt) || null,
    cloudVersion: cloudMeta && cloudMeta.version != null ? cloudMeta.version : null,
    cloudUpdatedAt: (cloudMeta && cloudMeta.updatedAt) || null,
    status,
    cloudError
  }
}

async function syncProfileToCloud(id, req) {
  const runningIds = getRunningIds()
  if (runningIds.includes(id)) {
    throw new Error('请先关闭该指纹浏览器再上传')
  }

  const workerDir = path.join(workersRoot, id)
  const outDir = profileSync.getSnapshotsDir(id)
  ensureDir(outDir)
  const outPath = path.join(outDir, `profile-${Date.now()}.zip`)
  const packed = profileSync.packProfile(workerDir, { outputPath: outPath })
  const meta = await uploadPackedSnapshot(id, packed.path, req)
  return { action: 'upload', packed, meta }
}

async function syncProfileFromCloud(id, req) {
  const runningIds = getRunningIds()
  if (runningIds.includes(id)) {
    throw new Error('请先关闭该指纹浏览器再拉取')
  }

  const token = getCloudToken(req)
  if (!token) {
    throw new Error('请先登录')
  }

  const workerDir = path.join(workersRoot, id)
  ensureDir(workerDir)
  const result = await cloudSync.downloadSnapshot(id, workerDir, token)
  if (!result) {
    throw new Error('云端无快照')
  }
  return { action: 'pull', ...result }
}

function getEnvCrxIds(envId) {
  const data = readJson(listFile, { users: [] })
  const item = (data.users || []).find(u => String(u.id) === String(envId))
  if (!item) return []
  return (item.crxIds || []).map(String)
}

function attachExitHandler(proc, id, workerDir, req) {
  proc.on('exit', () => {
    running.delete(id)
    releaseDebugPortForEnv(id)
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
          '[native-runtime] profile auto-pack:',
          packed.path,
          'size=',
          packed.size
        )
        await uploadPackedSnapshot(id, packed.path, exitReq)
      } catch (err) {
        console.error('[native-runtime] profile auto-pack failed:', err.message)
      }
    })()
  })
}

async function launchBrowser(envId, req, options = {}) {
  const id = String(envId)
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

  const extPaths = crxStore.getEnabledExtensionPathsForEnv(id, getEnvCrxIds(id))
  const debuggingPort = allocateDebugPort()
  envDebugPorts.set(id, debuggingPort)

  const spawnArgs = [
    `--worker-id=${id}`,
    `--user-data-dir=${workerDir}`,
    `--remote-debugging-port=${debuggingPort}`
  ]
  if (options.tempLaunchArgs && Array.isArray(options.tempLaunchArgs)) {
    spawnArgs.push(...options.tempLaunchArgs)
  }
  if (extPaths.length) {
    const joined = extPaths.join(',')
    spawnArgs.push(`--load-extension=${joined}`)
    spawnArgs.push(`--disable-extensions-except=${joined}`)
    console.log('[native-runtime] load-extension envId=', id, 'paths=', extPaths)
  }

  const proc = spawn(innerExe, spawnArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  proc.unref()
  running.set(id, proc)
  attachExitHandler(proc, id, workerDir, req)
  console.log('[native-runtime] launchBrowser id=', id, 'debuggingPort=', debuggingPort)
  return { ok: true, debuggingPort, envId: id }
}

async function stopBrowser(envId, req) {
  const id = String(envId)
  const proc = running.get(id)
  if (!proc || proc.exitCode != null || proc.killed) {
    releaseDebugPortForEnv(id)
    running.delete(id)
    return { ok: true, envId: id, wasRunning: false }
  }
  proc.kill()
  return { ok: true, envId: id, wasRunning: true }
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
      const data = readGlobalDataFile()
      return { data: JSON.stringify(data) }
    }
    case 'setGlobalData': {
      writeGlobalDataFile(params[0] || '{}')
      return { ok: true }
    }
    case 'deleteBrowser': {
      const id = String(params[0])
      await stopBrowser(id, req)
      return { ok: true }
    }
    case 'stopBrowser':
      return stopBrowser(params[0], req)
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
    case 'getProfileSyncStatus': {
      const id = String(params[0])
      return getProfileSyncStatus(id, req)
    }
    case 'syncProfileToCloud': {
      const id = String(params[0])
      return syncProfileToCloud(id, req)
    }
    case 'syncProfileFromCloud': {
      const id = String(params[0])
      return syncProfileFromCloud(id, req)
    }
    case 'syncEnvCrxBindings': {
      const envId = String(params[0])
      const crxIds = params[1] || []
      return crxStore.syncEnvCrxBindings(envId, crxIds)
    }
    case 'launchBrowser': {
      const id = String(params[0])
      const options = params[1] && typeof params[1] === 'object' ? params[1] : {}
      return launchBrowser(id, req, options)
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
      console.warn('[native-runtime] checkProxy not implemented')
      return false
    default:
      console.warn('[native-runtime] unhandled:', name, params)
      return null
  }
}

module.exports = {
  innerExe,
  pathsConfig,
  allocateDebugPort,
  releaseDebugPort,
  launchBrowser,
  stopBrowser,
  handleNativeCall,
  getRunningIds
}
