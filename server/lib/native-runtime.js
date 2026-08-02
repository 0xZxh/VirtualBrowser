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
const sessionWorker = require('./session-worker')
const { logNative, warnNative, errorNative } = require('./file-logger')

const repoRoot = path.join(__dirname, '../..')
const pathsConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'config/chrome-bin.paths.json'), 'utf8')
)

const {
  getWorkersRoot,
  getGlobalDatFile,
  getBrowserListFile,
  getLogsDir
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

/** stopBrowser 已上传时，跳过紧随其后的 exit auto-pack，避免重复上传 */
/** @type {Set<string>} */
const skipNextAutoPack = new Set()

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
  // compact JSON: virtual.dat / browser-list can be large (cookies); pretty-print was slow
  fs.writeFileSync(file, JSON.stringify(data), 'utf8')
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

/**
 * 本机 Worker 已有 Cookie/Storage 时不灌表单 Cookie，避免旧表单覆盖较新本地会话。
 * 空环境仍允许注入（首次导入/登录需要）。
 */
function shouldInjectFormCookies(workerDir, cookie) {
  if (
    !cookie ||
    Number(cookie.mode) !== 1 ||
    !Array.isArray(cookie.value) ||
    cookie.value.length === 0
  ) {
    return { inject: false, reason: 'no-form-cookies' }
  }
  if (profileSync.hasLocalSyncData(workerDir)) {
    return { inject: false, reason: 'local-session-present' }
  }
  return { inject: true, reason: 'empty-local-profile' }
}

/**
 * @returns {Promise<{ skipped: boolean, reason: string, ok?: number, fail?: number }>}
 */
async function maybeInjectFormCookies(envId, workerDir, debuggingPort, cookie, label) {
  const id = String(envId)
  const decision = shouldInjectFormCookies(workerDir, cookie)
  if (!decision.inject) {
    if (decision.reason === 'local-session-present') {
      logNative('CDP cookie inject skipped', {
        envId: id,
        reason: decision.reason,
        sessionMode: label === 'session'
      })
    }
    return { skipped: true, reason: decision.reason }
  }
  const result = await cdpNavigate.injectCookies(debuggingPort, cookie.value, 15000)
  console.log(
    `[native-runtime] ${label} CDP cookie inject envId=`,
    id,
    'ok=',
    result.ok,
    'fail=',
    result.fail
  )
  logNative('CDP cookie inject', {
    envId: id,
    ok: result.ok,
    fail: result.fail,
    sessionMode: label === 'session'
  })
  if (result.fail > 0 && result.errors && result.errors.length) {
    console.warn(
      '[native-runtime] CDP cookie inject errors:',
      result.errors.slice(0, 5).join('; ')
    )
    warnNative('CDP cookie inject errors', {
      envId: id,
      errors: result.errors.slice(0, 5)
    })
  }
  return { skipped: false, reason: decision.reason, ok: result.ok, fail: result.fail }
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

/** Only rewrite virtual.dat for given env ids (list refresh / single upsert). */
function syncWorkerProfilesByIds(data, ids) {
  const idSet = new Set((ids || []).map(id => String(id)))
  if (!idSet.size) return
  const users = ((data && data.users) || []).filter(item => idSet.has(String(item.id)))
  syncWorkerProfiles({ users })
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
 * 解析启动落地 URL：自定义主页优先；缺省默认京东到家门店页。
 * virtual-worker 仅当 homepage.mode===2（显式 IP 探测）时使用。
 */
const DEFAULT_LAUNCH_HOMEPAGE = 'https://store.jddj.com/'

function resolveLaunchStartupUrl(item) {
  const homepage = item && item.homepage
  const mode = homepage != null ? Number(homepage.mode) : NaN

  // mode=2：显式走 IP/virtual-worker 探测页
  if (mode === 2) {
    const globalData = readGlobalDataFile()
    const apiLink = String(
      (globalData && globalData.apiLink) || cloudSync.getDefaultIpGeoApiLink()
    ).trim()
    if (apiLink) {
      return `chrome://virtual-worker/?apiLink=${encodeURIComponent(apiLink)}`
    }
  }

  if (homepage && mode === 1) {
    const raw = String(homepage.value || '').trim()
    if (raw) {
      if (/^https?:\/\//i.test(raw) || /^chrome:\/\//i.test(raw)) {
        return raw
      }
      return `https://${raw}`
    }
  }

  // mode=0 / 缺省 / 空 value：产品默认主页（不再默默落到 virtual-worker）
  return DEFAULT_LAUNCH_HOMEPAGE
}

function isHttpStartupUrl(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

/**
 * 启动前写入 Chromium Preferences，避免恢复会话任务留下的页面。
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
  // 4 = Open a specific set of URLs；清掉会话恢复相关字段，避免回到刷新店铺留下的页
  prefs.session.restore_on_startup = 4
  prefs.session.startup_urls = [startupUrl]
  delete prefs.session.urls_to_restore_on_startup
  delete prefs.session.startup_urls_migration
  if (prefs.profile && typeof prefs.profile === 'object') {
    delete prefs.profile.exited_cleanly
  }
  writeJson(prefPath, prefs)
  console.log('[native-runtime] Preferences startup_urls=', startupUrl)
}

/** 会话任务结束后清理 Preferences，避免污染下次人工启动 */
function clearSessionStartupPollution(workerDir) {
  const prefPath = path.join(workerDir, 'Default', 'Preferences')
  if (!fs.existsSync(prefPath)) return
  try {
    const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'))
    if (!prefs.session || typeof prefs.session !== 'object') return
    delete prefs.session.urls_to_restore_on_startup
    prefs.session.restore_on_startup = 4
    prefs.session.startup_urls = [DEFAULT_LAUNCH_HOMEPAGE]
    writeJson(prefPath, prefs)
  } catch (err) {
    console.warn('[native-runtime] clearSessionStartupPollution failed:', err.message)
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

function getEnvDebugPort(envId) {
  const id = String(envId)
  const port = envDebugPorts.get(id)
  return port != null ? port : null
}

/**
 * Resolve CDP DevTools frontend URL for a running env.
 * @returns {Promise<{ port: number|null, url: string|null, error?: string }>}
 */
async function getEnvDebugInfo(envId) {
  const id = String(envId)
  const port = getEnvDebugPort(id)
  if (port == null) {
    return { port: null, url: null, error: '环境未运行或无 debugging 端口' }
  }
  const fallback = `http://127.0.0.1:${port}/json/list`
  try {
    const targets = await cdpNavigate.listTargets(port)
    const page =
      targets.find(t => t.type === 'page' && t.devtoolsFrontendUrl) ||
      targets.find(t => t.devtoolsFrontendUrl) ||
      targets[0]
    let url = fallback
    if (page && page.devtoolsFrontendUrl) {
      const df = String(page.devtoolsFrontendUrl)
      if (/^https?:\/\//i.test(df)) {
        url = df
      } else {
        url = `http://127.0.0.1:${port}${df.startsWith('/') ? '' : '/'}${df}`
      }
    }
    return { port, url }
  } catch (err) {
    const msg = err && err.message ? err.message : String(err)
    warnNative('getEnvDebugInfo failed', { envId: id, port, error: msg })
    return { port, url: fallback, error: msg }
  }
}

/**
 * 云端较新则 pull。fail-soft：失败只打日志。
 * @param {string} id
 * @param {object} req
 * @param {{ timeoutMs?: number }} [options] 超时后中止等待（下载可能仍在后台；不阻断启动）
 */
async function pullProfileIfNeeded(id, req, options = {}) {
  const token = getCloudToken(req)
  if (!token) {
    logNative('cloud.pull', { envId: id, pulled: false, reason: 'no-token' })
    return { pulled: false, reason: 'no-token' }
  }

  const workerDir = path.join(workersRoot, id)
  const timeoutMs =
    options.timeoutMs != null && Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : 0

  const doPull = async () => {
    const decision = await cloudSync.shouldPullFromCloud(id, workerDir, token)
    if (!decision.pull) {
      logNative('cloud.pull', {
        envId: id,
        pulled: false,
        reason: decision.reason,
        cloudVersion:
          decision.cloudMeta && decision.cloudMeta.version != null
            ? decision.cloudMeta.version
            : null
      })
      return { pulled: false, reason: decision.reason, cloudMeta: decision.cloudMeta }
    }

    logNative('cloud.pull', {
      envId: id,
      pulled: true,
      phase: 'download-start',
      reason: decision.reason,
      cloudVersion:
        decision.cloudMeta && decision.cloudMeta.version != null
          ? decision.cloudMeta.version
          : null
    })
    const result = await cloudSync.downloadSnapshot(id, workerDir, token)
    logNative('cloud.pull', {
      envId: id,
      pulled: true,
      phase: 'download-ok',
      reason: decision.reason,
      extracted: result && result.extracted
    })
    return {
      pulled: true,
      reason: decision.reason,
      cloudMeta: decision.cloudMeta,
      extracted: result && result.extracted
    }
  }

  try {
    if (!timeoutMs) {
      return await doPull()
    }
    let timer = null
    const result = await Promise.race([
      doPull(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`cloud pull 超时 (${timeoutMs}ms)`))
        }, timeoutMs)
      })
    ]).finally(() => {
      if (timer) clearTimeout(timer)
    })
    return result
  } catch (err) {
    console.error('[native-runtime] cloud pull failed:', err.message)
    warnNative('cloud.pull', { envId: id, pulled: false, reason: 'error', error: err.message })
    return { pulled: false, reason: 'error', error: err.message }
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
  } else if (
    localMeta.fileCount > 0 &&
    (!localCloudMeta || localCloudMeta.version == null)
  ) {
    // 与 shouldPullFromCloud 的 local-without-meta 一致：有本机会话但无 meta，自动 pull 不会覆盖
    status = 'local-without-meta'
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

  const loggedIn = sessionWorker.isLocalProfileLoggedIn(id)
  if (!loggedIn) {
    warnNative('manual.upload', {
      envId: String(id),
      skipped: true,
      reason: 'no-user-cookie',
      loggedIn: false
    })
    throw new Error('未登录到家（缺少 Cookie user），已跳过上传到云端')
  }

  const workerDir = path.join(workersRoot, id)
  const outDir = profileSync.getSnapshotsDir(id)
  ensureDir(outDir)
  const outPath = path.join(outDir, `profile-${Date.now()}.zip`)
  const packed = profileSync.packProfile(workerDir, { outputPath: outPath })
  const meta = await uploadPackedSnapshot(id, packed.path, req)
  logNative('manual.upload', {
    envId: String(id),
    ok: true,
    loggedIn: true,
    reason: 'ok',
    version: meta && meta.version
  })
  return { action: 'upload', packed, meta }
}

async function syncProfileFromCloud(id, req) {
  const runningIds = getRunningIds()
  if (runningIds.includes(id)) {
    throw new Error('请先关闭该指纹浏览器再拉取')
  }

  const token = getCloudToken(req)
  if (!token) {
    warnNative('cloud.pull.manual', { envId: id, error: 'no-token' })
    throw new Error('请先登录')
  }

  const workerDir = path.join(workersRoot, id)
  ensureDir(workerDir)
  logNative('cloud.pull.manual', { envId: id, phase: 'start' })
  const result = await cloudSync.downloadSnapshot(id, workerDir, token)
  if (!result) {
    warnNative('cloud.pull.manual', { envId: id, result: 'no-snapshot' })
    throw new Error('云端无快照')
  }
  logNative('cloud.pull.manual', {
    envId: id,
    phase: 'ok',
    extracted: result.extracted,
    version: result.cloudMeta && result.cloudMeta.version
  })
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
 * Windows：按 PID 杀进程树（Chromium 会拉起多个同名子进程）。
 */
function killPidTree(pid) {
  const n = Number(pid)
  if (!Number.isFinite(n) || n <= 0) return false
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(n)], {
        stdio: 'ignore',
        windowsHide: true
      })
      return true
    } catch {
      try {
        process.kill(n)
        return true
      } catch {
        return false
      }
    }
  }
  try {
    process.kill(n)
    return true
  } catch {
    return false
  }
}

/**
 * 杀掉占用该环境 user-data-dir / worker-id 的残留内核进程（不含桌面壳本身）。
 * 桌面壳与内核同名 VirtualBrowser.exe，必须用命令行参数区分。
 * @param {{ exceptPids?: Iterable<number|string> }} [options]
 */
function killStaleWorkerProcesses(envId, workerDir, options = {}) {
  if (process.platform !== 'win32') return { killed: 0 }
  const id = String(envId)
  const workerMarker = `--worker-id=${id}`
  const dirNorm = path.resolve(workerDir).toLowerCase()
  const except = new Set()
  for (const p of options.exceptPids || []) {
    const n = Number(p)
    if (Number.isFinite(n) && n > 0) except.add(n)
  }
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
      if (except.has(pid)) continue
      const cmdLower = cmd.toLowerCase()
      const matchWorker = cmd.includes(workerMarker)
      const matchDir =
        cmdLower.includes('--user-data-dir=') && cmdLower.includes(dirNorm)
      // 桌面壳不会带 --worker-id / Workers user-data-dir；助手进程常只有 --type=
      if (!(matchWorker || matchDir)) continue
      if (killPidTree(pid)) {
        killed += 1
        console.log(
          '[native-runtime] killed stale kernel tree pid=',
          pid,
          'envId=',
          id
        )
      }
    }
  } catch (err) {
    console.warn('[native-runtime] list stale processes failed:', err.message)
  }
  return { killed }
}

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 结束所有指纹内核（管理端退出时用；不杀桌面壳 Electron） */
function killAllWorkerKernels() {
  if (process.platform !== 'win32') return { killed: 0 }
  const workersRootNorm = path.resolve(workersRoot).toLowerCase()
  let killed = 0
  try {
    const raw = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='VirtualBrowser.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 20000 }
    ).trim()
    if (!raw) return { killed: 0 }
    const rows = JSON.parse(raw)
    const list = Array.isArray(rows) ? rows : [rows]
    for (const row of list) {
      const cmd = String((row && row.CommandLine) || '')
      const pid = Number(row && row.ProcessId)
      if (!pid || !cmd) continue
      const cmdLower = cmd.toLowerCase()
      // 内核：worker-id / Workers 目录 / Chrome-bin；桌面壳均不具备
      const looksLikeKernel =
        cmd.includes('--worker-id=') ||
        (cmdLower.includes('--user-data-dir=') &&
          cmdLower.includes(workersRootNorm)) ||
        (/chrome-bin/i.test(cmd) &&
          (cmd.includes('--type=') ||
            cmd.includes('--remote-debugging-port=') ||
            cmd.includes('--worker-id=')))
      if (!looksLikeKernel) continue
      if (killPidTree(pid)) {
        killed += 1
        console.log('[native-runtime] killAllWorkerKernels pid=', pid)
      }
    }
  } catch (err) {
    console.warn('[native-runtime] killAllWorkerKernels failed:', err.message)
  }
  return { killed }
}

/** 启动前：结束残留内核 + 清 Singleton 锁，避免「点了没窗 / CDP 不起」 */
async function prepareWorkerForLaunch(envId, workerDir) {
  const id = String(envId)
  const tracked = running.get(id)
  const killedPids = []
  if (tracked && tracked.exitCode == null && !tracked.killed) {
    const pid = tracked.pid
    try {
      tracked.kill()
    } catch (_) {
      /* ignore */
    }
    if (pid) {
      killPidTree(pid)
      killedPids.push(pid)
    }
    // 仅当仍是该 proc 时才删，避免与并发 relaunch 打架
    if (running.get(id) === tracked) {
      running.delete(id)
      releaseDebugPortForEnv(id)
    }
    // 给旧进程 exit 回调一点时间，降低误杀新 spawn 的窗口
    await sleepMs(250)
  }
  // 关窗后助手进程常无 Singleton 锁，启动前一律扫残留（勿杀即将使用的空 except）
  const killed = killStaleWorkerProcesses(envId, workerDir, {
    exceptPids: killedPids
  }).killed
  clearSingletonLocks(workerDir)
  return { killed }
}

function attachExitHandler(proc, id, workerDir, req) {
  proc.on('exit', code => {
    const current = running.get(id)
    const isCurrent = current === proc
    if (!isCurrent) {
      console.log(
        '[native-runtime] exit ignored (superseded) envId=',
        id,
        'oldPid=',
        proc.pid,
        'currentPid=',
        current && current.pid
      )
      skipNextAutoPack.delete(id)
      // 仍清扫孤儿，但保护 Map 里正在跑的新进程
      const except = []
      if (current && current.pid) except.push(current.pid)
      if (proc.pid) except.push(proc.pid)
      try {
        killStaleWorkerProcesses(id, workerDir, { exceptPids: except })
      } catch (err) {
        console.warn('[native-runtime] superseded exit sweep failed:', err.message)
      }
      return
    }

    running.delete(id)
    releaseDebugPortForEnv(id)
    // 主进程退出后 Chromium 助手进程常残留，扫一遍同 env 的内核树
    try {
      const except = []
      if (proc.pid) except.push(proc.pid)
      const still = running.get(id)
      if (still && still.pid) except.push(still.pid)
      const swept = killStaleWorkerProcesses(id, workerDir, { exceptPids: except })
      if (swept.killed > 0) {
        console.log(
          '[native-runtime] exit sweep killed=',
          swept.killed,
          'envId=',
          id
        )
      }
    } catch (err) {
      console.warn('[native-runtime] exit sweep failed:', err.message)
    }
    clearSessionStartupPollution(workerDir)
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
      warnNative('exit.upload', { envId: id, skipped: true, reason: 'abnormal-exit', code })
      cloudTokenByEnv.delete(id)
      skipNextAutoPack.delete(id)
      return
    }
    if (skipNextAutoPack.has(id)) {
      skipNextAutoPack.delete(id)
      cloudTokenByEnv.delete(id)
      logNative('exit.upload', { envId: id, skipped: true, reason: 'stop-already-uploaded' })
      return
    }
    const exitToken = cloudTokenByEnv.get(id)
    cloudTokenByEnv.delete(id)
    const exitReq = exitToken
      ? { headers: { authorization: `Bearer ${exitToken}` } }
      : null
    ;(async () => {
      try {
        const loggedIn = sessionWorker.isLocalProfileLoggedIn(id)
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
        if (!exitToken) {
          warnNative('exit.upload', {
            envId: id,
            skipped: true,
            reason: 'no-token',
            loggedIn,
            path: packed.path,
            size: packed.size
          })
          return
        }
        if (!loggedIn) {
          warnNative('exit.upload', {
            envId: id,
            skipped: true,
            reason: 'no-user-cookie',
            loggedIn: false,
            path: packed.path,
            size: packed.size
          })
          return
        }
        const meta = await uploadPackedSnapshot(id, packed.path, exitReq)
        logNative('exit.upload', {
          envId: id,
          ok: true,
          loggedIn: true,
          reason: 'ok',
          path: packed.path,
          size: packed.size,
          version: meta && meta.version
        })
      } catch (err) {
        console.error('[native-runtime] profile auto-pack failed:', err.message)
        warnNative('exit.upload', { envId: id, error: err.message })
      }
    })()
  })
}

/**
 * 会话/无头启动：尽量 headless；指纹内核若不吃 --headless=new 则用离屏+最小化降级。
 */
function buildSessionLaunchArgs(options = {}) {
  const args = []
  if (options.headlessHint) {
    args.push('--headless=new')
    args.push('--disable-gpu')
  }
  if (options.minimize || options.headlessHint) {
    // 不抢焦点 / 离屏（Windows 指纹内核常忽略标准 headless）
    args.push('--window-position=-32000,-32000')
    args.push('--window-size=1280,800')
  }
  if (Array.isArray(options.tempLaunchArgs)) {
    args.push(...options.tempLaunchArgs)
  }
  return args
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
  const prepared = await prepareWorkerForLaunch(id, workerDir)
  if (prepared.killed > 0) {
    console.log(
      '[native-runtime] cleared stale kernels before launch envId=',
      id,
      'killed=',
      prepared.killed
    )
    // 给 OS 一点时间释放 profile 文件锁
    await sleepMs(400)
  }
  const token = getCloudToken(req)
  if (token) {
    cloudTokenByEnv.set(id, token)
  }

  // 云端较新则 pull（带超时、fail-soft）。会话任务可 skipCloudPull（已单独拉过）。
  // 普通启动默认开启短超时 pull，避免多机 profile 过旧；超时不阻断启动。
  if (!options.skipCloudPull) {
    const pullTimeoutMs =
      options.pullTimeoutMs != null ? Number(options.pullTimeoutMs) : 20000
    console.log(
      '[native-runtime] launchBrowser: pullProfileIfNeeded envId=',
      id,
      'timeoutMs=',
      pullTimeoutMs
    )
    await pullProfileIfNeeded(id, req, { timeoutMs: pullTimeoutMs })
  } else {
    console.log(
      '[native-runtime] launchBrowser: skip cloud pull envId=',
      id
    )
  }

  const item = refreshWorkerVirtualDat(id)

  const extPaths = crxStore.getEnabledExtensionPathsForEnv(id, getEnvCrxIds(id))
  const debuggingPort = allocateDebugPort()
  envDebugPorts.set(id, debuggingPort)

  const spawnArgs = [
    `--worker-id=${id}`,
    `--user-data-dir=${workerDir}`,
    `--remote-debugging-port=${debuggingPort}`
  ]

  const sessionArgs = buildSessionLaunchArgs(options)
  if (sessionArgs.length) {
    spawnArgs.push(...sessionArgs)
    console.log('[native-runtime] session launch args=', sessionArgs)
  } else if (options.tempLaunchArgs && Array.isArray(options.tempLaunchArgs)) {
    spawnArgs.push(...options.tempLaunchArgs)
  }

  if (extPaths.length) {
    const joined = extPaths.join(',')
    spawnArgs.push(`--load-extension=${joined}`)
    spawnArgs.push(`--disable-extensions-except=${joined}`)
    console.log('[native-runtime] load-extension envId=', id, 'paths=', extPaths)
  }

  const skipUiNavigate = !!options.skipUiNavigate || !!options.sessionMode
  let startupUrl = resolveLaunchStartupUrl(item)
  if (skipUiNavigate) {
    // 会话任务自行导航到到家后台，避免先打开自定义主页抢焦点
    startupUrl = null
  } else if (startupUrl) {
    // 每次正常启动都写 Preferences，避免会话任务留下的恢复页
    if (isHttpStartupUrl(startupUrl)) {
      applyStartupPreferences(workerDir, startupUrl)
    }
  }
  if (startupUrl) {
    spawnArgs.push(startupUrl)
    console.log('[native-runtime] startupUrl=', startupUrl)
  }

  const windowsHide = !!(options.minimize || options.headlessHint || options.sessionMode)
  const proc = spawn(innerExe, spawnArgs, {
    detached: true,
    stdio: 'ignore',
    windowsHide
  })
  proc.unref()
  running.set(id, proc)
  attachExitHandler(proc, id, workerDir, req)
  console.log('[native-runtime] launchBrowser id=', id, 'debuggingPort=', debuggingPort)
  logNative('launchBrowser', { envId: id, debuggingPort, sessionMode: !!options.sessionMode })

  // 先等 CDP 就绪再给 UI 成功；否则 spawn 成功但内核秒崩会被误判为「已启动」
  const CDP_READY_MS = 20000
  let exitWatcher = null
  try {
    await Promise.race([
      cdpNavigate.waitForCdpReady(debuggingPort, CDP_READY_MS),
      new Promise((_, reject) => {
        const fail = (code, signal) => {
          const n = Number(code)
          const isAccessViolation =
            n === 3221225477 || n === -1073741819 || (Number.isFinite(n) && (n >>> 0) === 0xc0000005)
          const codeLabel = isAccessViolation
            ? `ACCESS_VIOLATION / 0xC0000005 (code=${code})`
            : `code=${code}${signal ? ` signal=${signal}` : ''}`
          let hint
          if (item && item.os && /mac|linux/i.test(String(item.os))) {
            hint = `当前指纹 OS 为「${item.os}」，在 Windows 内核上易崩溃，请先改为 Win 10/11。`
          } else {
            hint =
              '排查：①删除该环境 Workers/<id> 后重试；②检查杀毒是否拦截 / Chrome-bin 是否完整；③环境数据异常（含 virtual.dat 内过大或异常 Cookie）时可先关闭 Cookie 模式或清空 Cookie 后再试。'
          }
          reject(
            new Error(
              `内核进程异常退出 (${codeLabel})，启动未完成（CDP 未就绪）。${hint}`
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
    errorNative('launchBrowser CDP ready failed', { envId: id, error: msg })
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

  const autoCloseMs =
    options.autoCloseMs != null
      ? Number(options.autoCloseMs)
      : options.autoClose
        ? Number(options.autoClose) || 90000
        : 0
  if (autoCloseMs > 0) {
    setTimeout(() => {
      const still = running.get(id)
      if (still && still.exitCode == null && !still.killed) {
        console.log(
          '[native-runtime] autoClose kill envId=',
          id,
          'afterMs=',
          autoCloseMs
        )
        try {
          still.kill()
        } catch (_) {
          /* ignore */
        }
      }
    }, autoCloseMs)
  }

  // CDP 已就绪：后台导航 + Cookie 注入（不阻塞 IPC）；会话模式由 session-worker 自行导航
  if (!skipUiNavigate) {
    ;(async () => {
      if (isHttpStartupUrl(startupUrl)) {
        try {
          const nav = await cdpNavigate.navigateToUrl(debuggingPort, startupUrl, 20000)
          console.log('[native-runtime] CDP navigate ok:', nav.method, startupUrl)
        } catch (err) {
          console.error('[native-runtime] CDP navigate failed:', err.message)
        }
      }

      // Cookie 表单 mode=1：仅空本地会话时 CDP 注入；已有本地会话则跳过，避免旧表单覆盖
      try {
        await maybeInjectFormCookies(
          id,
          workerDir,
          debuggingPort,
          item && item.cookie,
          'launch'
        )
      } catch (err) {
        console.error('[native-runtime] CDP cookie inject failed:', err.message)
        errorNative('CDP cookie inject failed', {
          envId: id,
          error: err && err.message ? err.message : String(err)
        })
      }

      // 启动成功后回写最新 cookie（续期），失败不阻断
      try {
        await new Promise(r => setTimeout(r, 1500))
        const still = running.get(id)
        if (still && still.exitCode == null && !still.killed) {
          const synced = await sessionWorker.syncCookiesFromCdp(id, debuggingPort, token, {
            timeoutMs: 12000
          })
          logNative('launch cookie sync-out', {
            envId: id,
            cookieCount: synced.cookieCount,
            loggedIn: !!synced.loggedIn,
            cloudPut: synced.cloudPut || null
          })
        }
      } catch (err) {
        warnNative('launch cookie sync-out failed', {
          envId: id,
          error: err && err.message ? err.message : String(err)
        })
      }
    })()
  } else {
    // 会话模式：空本地会话才注入表单 Cookie；已有本地会话则信任磁盘登录态
    ;(async () => {
      try {
        await maybeInjectFormCookies(
          id,
          workerDir,
          debuggingPort,
          item && item.cookie,
          'session'
        )
      } catch (err) {
        console.error('[native-runtime] session cookie inject failed:', err.message)
      }
    })()
  }

  return {
    ok: true,
    debuggingPort,
    envId: id,
    startupUrl: startupUrl || null,
    sessionMode: !!options.sessionMode
  }
}

/**
 * @param {string|number} envId
 * @param {object} req
 * @param {{ skipProfileUpload?: boolean }} [options] 会话任务已上传时可跳过，避免重复
 */
async function stopBrowser(envId, req, options = {}) {
  const id = String(envId)
  const workerDir = path.join(workersRoot, id)
  const proc = running.get(id)
  const debugPort = getEnvDebugPort(id)
  const token = getCloudToken(req) || cloudTokenByEnv.get(id)
  const skipProfileUpload = options.skipProfileUpload === true

  // 关闭前 CDP 回写 cookie（续期），失败不阻断关闭；有 user 才上云
  let cookieLoggedIn = null
  if (proc && proc.exitCode == null && !proc.killed && debugPort) {
    try {
      const synced = await sessionWorker.syncCookiesFromCdp(id, debugPort, token, {
        timeoutMs: 8000
      })
      cookieLoggedIn = !!synced.loggedIn
      logNative('stop.cookie', {
        envId: id,
        cookieCount: synced.cookieCount,
        loggedIn: cookieLoggedIn,
        cloudPut: synced.cloudPut || null
      })
    } catch (err) {
      warnNative('stop.cookie', {
        envId: id,
        error: err && err.message ? err.message : String(err)
      })
    }
  }

  let wasRunning = false
  if (proc && proc.exitCode == null && !proc.killed) {
    wasRunning = true
    const pid = proc.pid
    try {
      proc.kill()
    } catch (_) {
      /* ignore */
    }
    if (pid) {
      killPidTree(pid)
    }
  }
  // 标记已由 stop 负责上传，避免 exit 重复（若 exit 仍走到 upload）
  skipNextAutoPack.add(id)
  running.delete(id)
  releaseDebugPortForEnv(id)
  // 无论是否在 running Map：扫同 env 的残留子进程（关窗后常见）
  const swept = killStaleWorkerProcesses(id, workerDir)
  clearSessionStartupPollution(workerDir)

  // 杀进程后再 pack+upload：stop 会删 running，exit auto-pack 常被当成 superseded 跳过
  if (skipProfileUpload) {
    logNative('stop.upload', { envId: id, skipped: true, reason: 'already-uploaded-by-session' })
  } else {
    try {
      await new Promise(r => setTimeout(r, 400))
      const loggedIn =
        cookieLoggedIn != null ? cookieLoggedIn : sessionWorker.isLocalProfileLoggedIn(id)
      ensureDir(workerDir)
      const outDir = profileSync.getSnapshotsDir(id)
      ensureDir(outDir)
      const outPath = path.join(outDir, `profile-stop-${Date.now()}.zip`)
      const packed = profileSync.packProfile(workerDir, { outputPath: outPath })
      if (!token) {
        warnNative('stop.upload', {
          envId: id,
          skipped: true,
          reason: 'no-token',
          loggedIn,
          path: packed.path,
          size: packed.size
        })
      } else if (!loggedIn) {
        warnNative('stop.upload', {
          envId: id,
          skipped: true,
          reason: 'no-user-cookie',
          loggedIn: false,
          path: packed.path,
          size: packed.size
        })
      } else {
        const stopReq =
          req && req.headers && req.headers.authorization
            ? req
            : { headers: { authorization: `Bearer ${token}` } }
        const meta = await uploadPackedSnapshot(id, packed.path, stopReq)
        logNative('stop.upload', {
          envId: id,
          ok: true,
          loggedIn: true,
          reason: 'ok',
          path: packed.path,
          size: packed.size,
          version: meta && meta.version
        })
      }
    } catch (err) {
      warnNative('stop.upload', {
        envId: id,
        error: err && err.message ? err.message : String(err)
      })
    }
  }

  console.log(
    '[native-runtime] stopBrowser envId=',
    id,
    'wasRunning=',
    wasRunning,
    'swept=',
    swept.killed
  )
  return { ok: true, envId: id, wasRunning, swept: swept.killed }
}

/** 停止所有已跟踪环境并清扫全部 worker 内核（管理端退出） */
function stopAllBrowsers() {
  const ids = [...running.keys()]
  for (const id of ids) {
    try {
      const proc = running.get(id)
      if (proc && proc.pid) {
        try {
          proc.kill()
        } catch (_) {
          /* ignore */
        }
        killPidTree(proc.pid)
      }
      running.delete(id)
      releaseDebugPortForEnv(id)
    } catch (err) {
      console.warn('[native-runtime] stopAllBrowsers item failed', id, err.message)
    }
  }
  const all = killAllWorkerKernels()
  console.log('[native-runtime] stopAllBrowsers killedKernels=', all.killed)
  return { ok: true, tracked: ids.length, killedKernels: all.killed }
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
      const opt = params[1] || {}
      writeJson(listFile, data)
      // syncWorkers: 'all' (default) | 'ids' | 'none'
      // 列表翻页只更新 list 文件、不写全部 virtual.dat，避免环境多时卡死
      const mode = opt.syncWorkers || 'all'
      if (mode === 'none') {
        // list cache only
      } else if (mode === 'ids') {
        syncWorkerProfilesByIds(data, opt.ids || [])
      } else {
        syncWorkerProfiles(data)
      }
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
      return stopBrowser(params[0], req, params[1] || {})
    case 'getRuningBrowser':
      return getRunningIds()
    case 'getEnvDebugPort':
      return getEnvDebugPort(params[0])
    case 'getEnvDebugInfo':
      return getEnvDebugInfo(params[0])
    case 'getLogsDir':
      return getLogsDir()
    case 'downloadLogsZip': {
      const { packLogsZip } = require('./file-logger')
      return packLogsZip()
    }
    case 'appendUiLog': {
      const level = String((params[0] && params[0].level) || 'INFO').toUpperCase()
      const message = String((params[0] && params[0].message) || '')
      const meta = params[0] && params[0].meta
      const { appendLog } = require('./file-logger')
      appendLog('ui', level, message, meta)
      return { ok: true }
    }
    case 'appendNativeLog': {
      const level = String((params[0] && params[0].level) || 'INFO').toUpperCase()
      const message = String((params[0] && params[0].message) || '')
      const meta = params[0] && params[0].meta
      const fl = require('./file-logger')
      if (level === 'ERROR') {
        fl.errorNative(message, meta)
      } else if (level === 'WARN' || level === 'WARNING') {
        fl.warnNative(message, meta)
      } else {
        fl.logNative(message, meta)
      }
      return { ok: true }
    }
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
    case 'runSessionKeepalive': {
      const id = String(params[0])
      const options = params[1] && typeof params[1] === 'object' ? params[1] : {}
      const sessionWorker = require('./session-worker')
      return sessionWorker.runSessionKeepalive(module.exports, id, req, options)
    }
    case 'runJddjFetch': {
      const id = String(params[0])
      const options = params[1] && typeof params[1] === 'object' ? params[1] : {}
      const sessionWorker = require('./session-worker')
      return sessionWorker.runJddjFetch(module.exports, id, req, options)
    }
    case 'getSessionQueueStats': {
      const sessionWorker = require('./session-worker')
      return sessionWorker.getQueueStats()
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
  stopAllBrowsers,
  killAllWorkerKernels,
  checkProxy,
  handleNativeCall,
  getRunningIds,
  getEnvDebugPort,
  getEnvDebugInfo,
  setBrowserExitListener,
  refreshWorkerVirtualDat,
  resolveLaunchStartupUrl,
  pullProfileIfNeeded,
  uploadPackedSnapshot,
  getCloudToken
}
