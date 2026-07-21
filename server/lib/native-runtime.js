const fs = require('fs')
const path = require('path')
const net = require('net')
const http = require('http')
const { spawn, execFileSync } = require('child_process')
const { URL } = require('url')
const profileSync = require('./profile-sync')
const cloudSync = require('./cloud-sync')
const crxStore = require('./crx-store')
const cdpNavigate = require('./cdp-navigate')
const { normalizeCookieEntry } = require('./cookie-normalize')

const repoRoot = path.join(__dirname, '../..')
const pathsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/chrome-bin.paths.json'), 'utf8')
)

const {
  getWorkersRoot,
  getGlobalDatFile,
  getBrowserListFile
} = require('../../config/vb-paths')

const innerExe = path.join(repoRoot, pathsConfig.innerExe.replace(/\//g, path.sep))
const workersRoot = getWorkersRoot()
const userDataFile = getGlobalDatFile()
const listFile = getBrowserListFile()

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

/** @type {((envId: string) => void) | null} */
let browserExitListener = null

function setBrowserExitListener(fn) {
  browserExitListener = typeof fn === 'function' ? fn : null
}

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

function sanitizeEnvItemCookies(item) {
  if (!item || !item.cookie) return item
  const cookie = { ...item.cookie }
  if (Array.isArray(cookie.value)) {
    cookie.value = cookie.value.map(c => {
      if (!c || typeof c !== 'object') return c
      return normalizeCookieEntry(c)
    })
  }
  return { ...item, cookie }
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

/**
 * 未配置 apiLink / Channel 时落到自建 IP 库（cloudApiBase + /api/ip-geo）。
 * 不覆盖用户已填写的第三方 URL。
 */
function ensureIpGeoDefaults(data) {
  const next = data && typeof data === 'object' ? { ...data } : {}
  let changed = false
  if (!String(next.apiLink || '').trim()) {
    next.apiLink = cloudSync.getDefaultIpGeoApiLink()
    next.Channel = 'selfhost'
    changed = true
  } else if (!String(next.Channel || '').trim()) {
    next.Channel = 'selfhost'
    changed = true
  }
  return { data: next, changed }
}

function readGlobalDataFile() {
  const raw = fs.existsSync(userDataFile) ? fs.readFileSync(userDataFile, 'utf8') : '{}'
  const data = parseGlobalDataPayload(raw)
  const { data: withDefaults, changed } = ensureIpGeoDefaults(data)
  const normalized = JSON.stringify(withDefaults)
  if (changed || (raw.trim() && raw.trim() !== normalized)) {
    ensureDir(path.dirname(userDataFile))
    fs.writeFileSync(userDataFile, normalized, 'utf8')
  }
  return withDefaults
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
    const safe = sanitizeEnvItemCookies(item)
    const workerDir = path.join(workersRoot, String(safe.id))
    ensureDir(workerDir)
    writeJson(path.join(workerDir, 'virtual.dat'), { users: [safe] })
  }
}

/** 启动前从 browser-list.json 刷新该环境的 virtual.dat */
function refreshWorkerVirtualDat(envId) {
  const id = String(envId)
  const data = readJson(listFile, { users: [] })
  const item = (data.users || []).find(u => String(u.id) === id)
  if (!item) {
    throw new Error(
      `环境 ${id} 不在本地 browser-list.json，请先保存环境后再启动`
    )
  }
  const safe = sanitizeEnvItemCookies(item)
  const workerDir = path.join(workersRoot, id)
  ensureDir(workerDir)
  writeJson(path.join(workerDir, 'virtual.dat'), { users: [safe] })
  return safe
}

/**
 * 解析启动落地 URL：自定义主页优先；否则把共享 global.dat 的 apiLink
 * （缺省则自建 cloudApiBase/api/ip-geo）注入 chrome://virtual-worker。
 */
function resolveLaunchStartupUrl(item) {
  const homepage = item && item.homepage
  if (homepage && Number(homepage.mode) === 1) {
    const raw = String(homepage.value || '').trim()
    if (raw) {
      if (/^https?:\/\//i.test(raw) || /^chrome:\/\//i.test(raw)) {
        return raw
      }
      return `https://${raw}`
    }
  }

  const globalData = readGlobalDataFile()
  const apiLink = String(
    (globalData && globalData.apiLink) || cloudSync.getDefaultIpGeoApiLink()
  ).trim()
  if (apiLink) {
    return `chrome://virtual-worker/?apiLink=${encodeURIComponent(apiLink)}`
  }
  return null
}

function isHttpStartupUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

/**
 * 启动前写入 Chromium Preferences，避免恢复上次的 virtual-worker。
 */
function applyStartupPreferences(workerDir, startupUrl) {
  if (!isHttpStartupUrl(startupUrl)) return
  const prefPath = path.join(workerDir, 'Default', 'Preferences')
  ensureDir(path.dirname(prefPath))
  let prefs = {}
  try {
    if (fs.existsSync(prefPath)) {
      prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'))
    }
  } catch (err) {
    console.warn('[native-runtime] Preferences parse failed, recreating:', err.message)
    prefs = {}
  }
  if (!prefs.session || typeof prefs.session !== 'object') {
    prefs.session = {}
  }
  prefs.session.restore_on_startup = 4
  prefs.session.startup_urls = [startupUrl]
  writeJson(prefPath, prefs)
  console.log('[native-runtime] Preferences startup_urls=', startupUrl)
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
  const header = String((req && req.headers && req.headers.authorization) || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ''
}

function getCloudToken(req) {
  const fromRequest = extractBearerToken(req)
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

/** Windows NTSTATUS 类异常退出码（如 0xC0000005 ACCESS_VIOLATION） */
function isAbnormalExitCode(code) {
  if (code == null) return false
  const n = Number(code)
  if (!Number.isFinite(n)) return false
  // Node 在 Win 上常返回无符号值（3221225477 === 0xC0000005）
  return n < 0 || n > 255
}

const SINGLETON_LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket']

function clearSingletonLocks(workerDir) {
  for (const name of SINGLETON_LOCK_FILES) {
    const p = path.join(workerDir, name)
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch (err) {
      console.warn('[native-runtime] clear lock failed:', p, err.message)
    }
  }
}

/**
 * 杀掉占用该环境 user-data-dir / worker-id 的残留内核进程（不含桌面壳本身）。
 * 桌面壳与内核同名 VirtualBrowser.exe，必须用命令行参数区分。
 */
function killStaleWorkerProcesses(envId, workerDir) {
  if (process.platform !== 'win32') return { killed: 0 }
  const id = String(envId)
  const workerMarker = `--worker-id=${id}`
  const dirNorm = path.resolve(workerDir).toLowerCase()
  let killed = 0
  try {
    const raw = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='VirtualBrowser.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 }
    ).trim()
    if (!raw) return { killed: 0 }
    const rows = JSON.parse(raw)
    const list = Array.isArray(rows) ? rows : [rows]
    for (const row of list) {
      const cmd = String((row && row.CommandLine) || '')
      const pid = Number(row && row.ProcessId)
      if (!pid || !cmd) continue
      const cmdLower = cmd.toLowerCase()
      const matchWorker = cmd.includes(workerMarker)
      const matchDir =
        cmdLower.includes('--user-data-dir=') && cmdLower.includes(dirNorm)
      // 内核路径含 Chrome-bin；桌面壳没有 worker-id
      const looksLikeKernel =
        /chrome-bin/i.test(cmd) || cmd.includes('--remote-debugging-port=')
      if (!(matchWorker || matchDir) || !looksLikeKernel) continue
      try {
        process.kill(pid)
        killed += 1
        console.log(
          '[native-runtime] killed stale kernel pid=',
          pid,
          'envId=',
          id
        )
      } catch (err) {
        try {
          execFileSync('taskkill.exe', ['/F', '/PID', String(pid)], {
            stdio: 'ignore',
            windowsHide: true
          })
          killed += 1
          console.log(
            '[native-runtime] taskkill stale kernel pid=',
            pid,
            'envId=',
            id
          )
        } catch (err2) {
          console.warn(
            '[native-runtime] kill stale failed pid=',
            pid,
            err2.message
          )
        }
      }
    }
  } catch (err) {
    console.warn('[native-runtime] list stale processes failed:', err.message)
  }
  return { killed }
}

/** 启动前：结束残留内核 + 清 Singleton 锁，避免「点了没窗 / CDP 不起」 */
function prepareWorkerForLaunch(envId, workerDir) {
  const tracked = running.get(String(envId))
  if (tracked && tracked.exitCode == null && !tracked.killed) {
    try {
      tracked.kill()
    } catch (_) {
      /* ignore */
    }
    running.delete(String(envId))
    releaseDebugPortForEnv(String(envId))
  }
  const { killed } = killStaleWorkerProcesses(envId, workerDir)
  clearSingletonLocks(workerDir)
  return { killed }
}

function attachExitHandler(proc, id, workerDir, req) {
  proc.on('exit', code => {
    running.delete(id)
    releaseDebugPortForEnv(id)
    if (browserExitListener) {
      try {
        browserExitListener(id)
      } catch (err) {
        console.error('[native-runtime] browserExitListener failed:', err.message)
      }
    }
    if (isAbnormalExitCode(code)) {
      console.error(
        '[native-runtime] browser crashed, skip auto cloud upload envId=',
        id,
        'code=',
        code
      )
      cloudTokenByEnv.delete(id)
      return
    }
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
  if (process.platform !== 'win32') {
    throw new Error(
      `当前为 ${process.platform}：指纹内核 VirtualBrowser.exe 仅支持 Windows。` +
        `Mac/Linux 可继续创建/编辑环境与云同步，启动请在 Windows 实机或装包环境验证。`
    )
  }
  if (!fs.existsSync(innerExe)) {
    throw new Error(`内核不存在: ${innerExe}，请安装 Chrome-bin`)
  }
  const workerDir = path.join(workersRoot, id)
  ensureDir(workerDir)
  const prepared = prepareWorkerForLaunch(id, workerDir)
  if (prepared.killed > 0) {
    console.log(
      '[native-runtime] cleared stale kernels before launch envId=',
      id,
      'killed=',
      prepared.killed
    )
    // 给 OS 一点时间释放 profile 文件锁
    await new Promise(r => setTimeout(r, 400))
  }
  const token = getCloudToken(req)
  if (token) {
    cloudTokenByEnv.set(id, token)
  }
  // 启动路径不再 await 云端 pull（大快照会卡死 IPC / 前端超时）。
  // 站点 Cookie/存储请用列表「云同步」手动拉取；指纹表单走 Mongo + virtual.dat。
  console.log(
    '[native-runtime] launchBrowser: skip auto cloud pull envId=',
    id,
    '（站点数据请用云同步按钮）'
  )
  const item = refreshWorkerVirtualDat(id)

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

  const startupUrl = resolveLaunchStartupUrl(item)
  if (isHttpStartupUrl(startupUrl)) {
    applyStartupPreferences(workerDir, startupUrl)
  }
  if (startupUrl) {
    spawnArgs.push(startupUrl)
    console.log('[native-runtime] startupUrl=', startupUrl)
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

  // 先等 CDP 就绪再给 UI 成功；否则 spawn 成功但内核秒崩会被误判为「已启动」
  const CDP_READY_MS = 20000
  let exitWatcher = null
  try {
    await Promise.race([
      cdpNavigate.waitForCdpReady(debuggingPort, CDP_READY_MS),
      new Promise((_, reject) => {
        const fail = (code, signal) => {
          const osHint =
            item && item.os && /mac|linux/i.test(String(item.os))
              ? `当前指纹 OS 为「${item.os}」，在 Windows 内核上易崩溃，请先改为 Win 10/11。`
              : '可尝试删除本机 Workers 目录后冷启动，或将 OS 改为 Win 10/11。'
          reject(
            new Error(
              `指纹内核启动后立即退出 (code=${code}${signal ? ` signal=${signal}` : ''})。${osHint}`
            )
          )
        }
        if (proc.exitCode != null || proc.killed) {
          fail(proc.exitCode, proc.signalCode)
          return
        }
        exitWatcher = (code, signal) => fail(code, signal)
        proc.once('exit', exitWatcher)
      })
    ])
  } catch (err) {
    if (proc.exitCode == null && !proc.killed) {
      try {
        proc.kill()
      } catch (_) {
        /* ignore */
      }
    }
    running.delete(id)
    releaseDebugPortForEnv(id)
    const msg = String((err && err.message) || err)
    if (/CDP|未就绪|timeout/i.test(msg)) {
      throw new Error(
        `指纹内核未在规定时间内就绪（${msg}）。请关闭残留的指纹窗口后重试；启动前会自动清理占用该环境的内核进程。`
      )
    }
    throw err
  } finally {
    if (exitWatcher) {
      proc.removeListener('exit', exitWatcher)
    }
  }

  // CDP 已就绪：后台导航 + Cookie 注入（不阻塞 IPC）
  ;(async () => {
    if (isHttpStartupUrl(startupUrl)) {
      try {
        const nav = await cdpNavigate.navigateToUrl(debuggingPort, startupUrl, 20000)
        console.log('[native-runtime] CDP navigate ok:', nav.method, startupUrl)
      } catch (err) {
        console.error('[native-runtime] CDP navigate failed:', err.message)
      }
    }

    // Cookie 表单 mode=1 时用 CDP Network.setCookie 强制注入（不依赖内核读 virtual.dat）
    try {
      const cookie = item && item.cookie
      if (
        cookie &&
        Number(cookie.mode) === 1 &&
        Array.isArray(cookie.value) &&
        cookie.value.length > 0
      ) {
        const result = await cdpNavigate.injectCookies(
          debuggingPort,
          cookie.value,
          15000
        )
        console.log(
          '[native-runtime] CDP cookie inject envId=',
          id,
          'ok=',
          result.ok,
          'fail=',
          result.fail
        )
        if (result.fail > 0 && result.errors && result.errors.length) {
          console.warn(
            '[native-runtime] CDP cookie inject errors:',
            result.errors.slice(0, 5).join('; ')
          )
        }
      }
    } catch (err) {
      console.error('[native-runtime] CDP cookie inject failed:', err.message)
    }
  })()

  return { ok: true, debuggingPort, envId: id, startupUrl: startupUrl || null }
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

/**
 * TCP 连通检测（host:port）。
 */
function tcpConnect(host, port, timeoutMs) {
  return new Promise(resolve => {
    let settled = false
    const done = ok => {
      if (settled) return
      settled = true
      resolve(!!ok)
    }
    const socket = net.connect({ host, port }, () => {
      socket.destroy()
      done(true)
    })
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => {
      socket.destroy()
      done(false)
    })
    socket.on('error', () => done(false))
  })
}

/**
 * HTTP 代理轻量探测：对代理发 CONNECT；有 HTTP 状态码即视为响应。
 * 失败时不覆盖 TCP 成功结论（部分代理禁用 CONNECT）。
 */
function httpProxyProbe(host, port, timeoutMs, authHeader) {
  return new Promise(resolve => {
    const headers = {
      Host: 'example.com:443',
      Connection: 'close'
    }
    if (authHeader) {
      headers['Proxy-Authorization'] = authHeader
    }
    const req = http.request(
      {
        host,
        port,
        method: 'CONNECT',
        path: 'example.com:443',
        timeout: timeoutMs,
        headers
      },
      res => {
        resolve((res.statusCode || 0) > 0)
        res.resume()
      }
    )
    req.on('connect', () => resolve(true))
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

/**
 * 基础代理检测：对 proxy.url 做 TCP 连通；HTTP(S) 再尝试 CONNECT 探测。
 * @param {string} proxyUrl
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<boolean>}
 */
async function checkProxy(proxyUrl, timeoutMs = 8000) {
  if (!proxyUrl || typeof proxyUrl !== 'string') {
    return false
  }
  let parsed
  try {
    parsed = new URL(proxyUrl.includes('://') ? proxyUrl : `http://${proxyUrl}`)
  } catch {
    return false
  }

  const host = parsed.hostname
  if (!host) {
    return false
  }
  const protocol = (parsed.protocol || 'http:').toLowerCase()
  const port =
    Number(parsed.port) ||
    (protocol === 'https:' ? 443 : protocol.startsWith('socks') ? 1080 : 80)

  const tcpOk = await tcpConnect(host, port, timeoutMs)
  if (!tcpOk) {
    return false
  }
  if (protocol.startsWith('socks')) {
    return true
  }

  let authHeader = ''
  if (parsed.username || parsed.password) {
    const token = Buffer.from(
      `${decodeURIComponent(parsed.username || '')}:${decodeURIComponent(parsed.password || '')}`,
      'utf8'
    ).toString('base64')
    authHeader = `Basic ${token}`
  }
  // TCP 已通即算基础通过；HTTP 探测仅作增强（失败不降级）
  await httpProxyProbe(host, port, Math.min(timeoutMs, 5000), authHeader).catch(() => false)
  return true
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
    case 'checkProxy': {
      const proxyUrl = params[0]
      const timeoutMs =
        typeof params[1] === 'number' && params[1] > 0 ? params[1] : 8000
      return checkProxy(proxyUrl, timeoutMs)
    }
    case 'getCloudApiBase':
      return cloudSync.getCloudApiBase()
    case 'getDefaultIpGeoApiLink':
      return cloudSync.getDefaultIpGeoApiLink()
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
  checkProxy,
  handleNativeCall,
  getRunningIds,
  setBrowserExitListener,
  refreshWorkerVirtualDat,
  resolveLaunchStartupUrl
}
