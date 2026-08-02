/**
 * 后台会话队列：无头/最小化启动环境 → CDP 续 Cookie → 可选到家抓取 → 落盘/云上传。
 * 全局并发上限 1～2，避免本机卡死。
 */
const fs = require('fs')
const path = require('path')
const { getBrowserListFile, getWorkersRoot } = require('../../config/vb-paths')
const { normalizeCookieEntry } = require('./cookie-normalize')
const cdpNavigate = require('./cdp-navigate')
const jddjScraper = require('./jddj-scraper')
const jddjSelectors = require('./jddj-selectors')
const { parseShopIdFromCookies } = require('./jddj-shop-id')
const profileSync = require('./profile-sync')
const cloudSync = require('./cloud-sync')
const { logNative, warnNative, errorNative } = require('./file-logger')

const MAX_CONCURRENT = 2
const DEFAULT_SESSION_TIMEOUT_MS = 90000
const DEFAULT_PULL_TIMEOUT_MS = 25000

/** @type {Array<{ run: () => Promise<any>, resolve: Function, reject: Function }>} */
const queue = []
let active = 0

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
  fs.writeFileSync(file, JSON.stringify(data), 'utf8')
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const job = queue.shift()
    active += 1
    Promise.resolve()
      .then(() => job.run())
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1
        pump()
      })
  }
}

function enqueue(run) {
  return new Promise((resolve, reject) => {
    queue.push({ run, resolve, reject })
    pump()
  })
}

function withTimeout(promise, ms, label) {
  const timeoutMs = Math.max(1000, Number(ms) || 0)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label || 'operation'} 超时 (${timeoutMs}ms)`))
    }, timeoutMs)
    Promise.resolve(promise).then(
      v => {
        clearTimeout(timer)
        resolve(v)
      },
      err => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function getCloudToken(req) {
  const header = String((req && req.headers && req.headers.authorization) || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (match) return match[1].trim()
  return process.env.CLOUD_API_TOKEN || ''
}

/** @type {{ runId: string, envId: string } | null} */
let activeRunContext = null

function topCookieDomains(cookies, limit = 8) {
  const map = Object.create(null)
  for (const c of Array.isArray(cookies) ? cookies : []) {
    const d = String((c && c.domain) || '')
      .replace(/^\./, '')
      .trim()
    if (!d) continue
    map[d] = (map[d] || 0) + 1
  }
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([domain, count]) => ({ domain, count }))
}

async function cloudApiJson(method, apiPath, token, body, timeoutMs = 20000) {
  if (!token) throw new Error('未登录，无法调用云端 API')
  const url = `${cloudSync.getCloudApiBase()}${apiPath}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json'
  }
  const opts = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const t0 = Date.now()
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    const elapsedMs = Date.now() - t0
    const meta = {
      runId: activeRunContext && activeRunContext.runId,
      envId: activeRunContext && activeRunContext.envId,
      method,
      path: apiPath,
      status: res.status,
      elapsedMs
    }
    if (!res.ok) {
      warnNative('jddj.api.cloud', { ...meta, error: text.slice(0, 200) })
      throw new Error(
        `cloud API ${method} ${apiPath} failed (${res.status}): ${text.slice(0, 200)}`
      )
    }
    logNative('jddj.api.cloud', meta)
    return json && json.data !== undefined ? json.data : json
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 写回本地 browser-list + virtual.dat 的 cookie（mode=1）。
 * 不在 list 中新增残缺环境项（避免冲掉 homepage 等字段）。
 */
function writeCookiesToLocalProfile(envId, cookies) {
  const listFile = getBrowserListFile()
  const workersRoot = getWorkersRoot()
  const id = String(envId)
  const data = readJson(listFile, { users: [] })
  const users = Array.isArray(data.users) ? data.users : []
  const idx = users.findIndex(u => String(u.id) === id)
  const normalized = (Array.isArray(cookies) ? cookies : [])
    .map(c => normalizeCookieEntry(c))
    .filter(c => c && c.name != null)

  if (idx < 0) {
    // 本地 list 无完整项：只更新已有 virtual.dat（若存在），避免写入 {id,name,cookie} 残缺项
    const workerDir = path.join(workersRoot, id)
    const datPath = path.join(workerDir, 'virtual.dat')
    let item = null
    try {
      if (fs.existsSync(datPath)) {
        const dat = readJson(datPath, { users: [] })
        item = Array.isArray(dat.users) && dat.users[0] ? dat.users[0] : null
      }
    } catch {
      item = null
    }
    if (!item) {
      console.warn(
        '[session-worker] skip cookie list write: env not in browser-list.json',
        id
      )
      return { cookieCount: normalized.length, item: null, skippedList: true }
    }
    item = {
      ...item,
      cookie: { mode: 1, value: normalized }
    }
    ensureDir(workerDir)
    writeJson(datPath, { users: [item] })
    return { cookieCount: normalized.length, item, skippedList: true }
  }

  users[idx] = {
    ...users[idx],
    cookie: { mode: 1, value: normalized }
  }
  writeJson(listFile, { users })

  const workerDir = path.join(workersRoot, id)
  ensureDir(workerDir)
  const item = users[idx]
  writeJson(path.join(workerDir, 'virtual.dat'), { users: [item] })
  return { cookieCount: normalized.length, item }
}

/**
 * 到家登录判定：存在 name===user 且 value 非空的 cookie。
 */
function hasJddjUserCookie(cookies) {
  return (Array.isArray(cookies) ? cookies : []).some(
    c => c && String(c.name) === 'user' && String(c.value != null ? c.value : '').trim() !== ''
  )
}

/** 从本地 browser-list / virtual.dat 读取环境 cookie.value */
function readCookiesFromLocalProfile(envId) {
  const id = String(envId)
  const listFile = getBrowserListFile()
  const data = readJson(listFile, { users: [] })
  const users = Array.isArray(data.users) ? data.users : []
  const item = users.find(u => String(u.id) === id)
  if (item && item.cookie && Array.isArray(item.cookie.value)) {
    return item.cookie.value
  }
  try {
    const datPath = path.join(getWorkersRoot(), id, 'virtual.dat')
    const dat = readJson(datPath, { users: [] })
    const u = Array.isArray(dat.users) && dat.users[0] ? dat.users[0] : null
    if (u && u.cookie && Array.isArray(u.cookie.value)) {
      return u.cookie.value
    }
  } catch {
    // ignore
  }
  return []
}

function isLocalProfileLoggedIn(envId) {
  return hasJddjUserCookie(readCookiesFromLocalProfile(envId))
}

async function persistCookiesToBackend(envId, cookies, token) {
  if (!token) return { skipped: true, reason: 'no-token' }
  const normalized = (Array.isArray(cookies) ? cookies : [])
    .map(c => normalizeCookieEntry(c))
    .filter(c => c && c.name != null)
  await cloudApiJson(
    'PUT',
    `/api/environments/${encodeURIComponent(String(envId))}`,
    token,
    { cookie: { mode: 1, value: normalized } }
  )
  return { ok: true, cookieCount: normalized.length }
}

/**
 * CDP 读 cookie → 写本地 profile；仅登录态（有 user cookie）才 PUT 上云。
 * @returns {{ cookieCount: number, cookies: object[], loggedIn: boolean, cloudPut: string }}
 */
async function syncCookiesFromCdp(envId, port, token, options = {}) {
  const timeoutMs = options.timeoutMs != null ? Number(options.timeoutMs) : 15000
  const all = await cdpNavigate.getAllCookies(port, timeoutMs)
  const cookies = all.cookies || []
  const loggedIn = hasJddjUserCookie(cookies)
  const local = writeCookiesToLocalProfile(envId, cookies)
  let cloudPut = 'skipped'
  if (!token) {
    cloudPut = 'skipped-no-token'
    logNative('cookie.sync', {
      envId: String(envId),
      loggedIn,
      cloudPut,
      reason: 'no-token',
      cookieCount: local.cookieCount
    })
  } else if (!loggedIn) {
    cloudPut = 'skipped-no-user-cookie'
    warnNative('cookie.sync skipped cloud', {
      envId: String(envId),
      loggedIn: false,
      reason: 'no-user-cookie',
      cookieCount: local.cookieCount
    })
  } else {
    try {
      await persistCookiesToBackend(envId, cookies, token)
      cloudPut = 'ok'
      logNative('cookie.sync', {
        envId: String(envId),
        loggedIn: true,
        cloudPut,
        reason: 'ok',
        cookieCount: local.cookieCount
      })
    } catch (err) {
      cloudPut = 'error'
      warnNative('persist cookies to backend failed', {
        envId: String(envId),
        loggedIn: true,
        error: (err && err.message) || String(err)
      })
    }
  }
  return { cookieCount: local.cookieCount, cookies, loggedIn, cloudPut }
}

async function persistSiteSnapshot(envId, jddj, token) {
  if (!token) return { skipped: true, reason: 'no-token' }
  return cloudApiJson(
    'PUT',
    `/api/environments/${encodeURIComponent(String(envId))}/site-snapshot`,
    token,
    { jddj }
  )
}

/**
 * @param {object} runtime — native-runtime module (injected to avoid circular require)
 * @param {string|number} envId
 * @param {object} req
 * @param {{
 *   scrape?: boolean,
 *   entryUrl?: string,
 *   sessionTimeoutMs?: number,
 *   pullTimeoutMs?: number,
 *   collectMs?: number
 * }} [options]
 */
async function runSessionJob(runtime, envId, req, options = {}) {
  const id = String(envId)
  const sessionTimeoutMs =
    options.sessionTimeoutMs != null
      ? Number(options.sessionTimeoutMs)
      : DEFAULT_SESSION_TIMEOUT_MS
  const pullTimeoutMs =
    options.pullTimeoutMs != null ? Number(options.pullTimeoutMs) : DEFAULT_PULL_TIMEOUT_MS
  const scrape = !!options.scrape
  const entryUrl = String(options.entryUrl || jddjSelectors.DEFAULT_ENTRY_URL).trim()
  const token = getCloudToken(req)
  const startedAt = Date.now()
  const runId = `jddj-${id}-${startedAt}`
  const prevCtx = activeRunContext
  activeRunContext = { runId, envId: id }

  const queueDepth = queue.length
  logNative('jddj.run.start', {
    runId,
    envId: id,
    scrape,
    entryUrl,
    queueDepth,
    active,
    hasToken: !!token,
    trigger: options.trigger || (scrape ? 'jddj-fetch' : 'session-keepalive')
  })

  const runningIds = runtime.getRunningIds()
  if (runningIds.includes(id)) {
    activeRunContext = prevCtx
    throw new Error(`环境 ${id} 已在运行，请先关闭后再跑会话任务`)
  }

  // 1) 云端较新则 pull（超时 fail-soft）
  let pull = { attempted: false, ok: false, error: null, result: null }
  try {
    pull.attempted = true
    pull.result = await withTimeout(
      runtime.pullProfileIfNeeded(id, req, { timeoutMs: pullTimeoutMs }),
      pullTimeoutMs + 2000,
      'pullProfileIfNeeded'
    )
    pull.ok = true
    logNative('jddj.pull', {
      runId,
      envId: id,
      pulled: !!(pull.result && pull.result.pulled),
      reason: (pull.result && pull.result.reason) || null,
      cloudVersion:
        pull.result && pull.result.cloudMeta && pull.result.cloudMeta.version != null
          ? pull.result.cloudMeta.version
          : null
    })
  } catch (err) {
    pull.error = (err && err.message) || String(err)
    warnNative('jddj.pull', { runId, envId: id, error: pull.error, failSoft: true })
  }

  let launchResult = null
  let killTimer = null
  let cookiesResult = { cookieCount: 0, loggedIn: false, cloudPut: null }
  let upload = { ok: false, skipped: false, error: null }
  let jddj = null
  let runError = null
  let port = null

  try {
    // 2) 启动（最小化 / headless 降级；跳过默认 startup 导航）
    const launchAt = Date.now()
    launchResult = await runtime.launchBrowser(id, req, {
      headlessHint: true,
      minimize: true,
      skipUiNavigate: true,
      skipCloudPull: true, // 上面已单独 pull
      sessionMode: true,
      autoCloseMs: sessionTimeoutMs
    })

    port = launchResult && launchResult.debuggingPort
    logNative('jddj.launch', {
      runId,
      envId: id,
      debuggingPort: port || null,
      sessionMode: true,
      elapsedMs: Date.now() - launchAt
    })
    if (!port) {
      throw new Error('会话启动成功但无 debuggingPort')
    }

    // 强制超时杀进程
    killTimer = setTimeout(() => {
      warnNative('session timeout kill', { runId, envId: id, sessionTimeoutMs })
      runtime.stopBrowser(id, req).catch(() => {})
    }, sessionTimeoutMs)

    // 3) 打开到家后台
    const navAt = Date.now()
    await cdpNavigate.navigateToUrl(port, entryUrl, 20000)
    await new Promise(r => setTimeout(r, 2000))
    logNative('jddj.navigate', {
      runId,
      envId: id,
      url: entryUrl,
      elapsedMs: Date.now() - navAt
    })

    // 4) Cookie 写回（有 user cookie 才上云）
    let cookies = []
    try {
      const synced = await syncCookiesFromCdp(id, port, token, { timeoutMs: 15000 })
      cookiesResult = {
        cookieCount: synced.cookieCount,
        loggedIn: !!synced.loggedIn,
        cloudPut: synced.cloudPut || null
      }
      cookies = synced.cookies || []
      logNative('jddj.cookie.sync', {
        runId,
        envId: id,
        cookieCount: synced.cookieCount,
        loggedIn: !!synced.loggedIn,
        domains: topCookieDomains(cookies),
        backendPut: synced.cloudPut || null
      })
    } catch (err) {
      warnNative('jddj.cookie.sync', {
        runId,
        envId: id,
        error: (err && err.message) || String(err)
      })
    }

    // 5) 抓取（可选）
    if (scrape) {
      jddj = await jddjScraper.scrapeJddj(port, {
        entryUrl,
        collectMs: options.collectMs,
        logContext: { runId, envId: id }
      })
      // 抓取仍无 shopId 时，用 cookie 补全
      let cookieFallbackAttempted = false
      if (jddj && !jddj.shopId && cookies.length) {
        cookieFallbackAttempted = true
        const found = parseShopIdFromCookies(cookies)
        if (found.shopId) {
          jddj = {
            ...jddj,
            shopId: found.shopId,
            shopIdSource: found.shopIdSource || 'cookie'
          }
        }
      }
      const jddjMeta = {
        runId,
        envId: id,
        hasShopId: !!(jddj && jddj.shopId),
        shopId: (jddj && jddj.shopId) || null,
        shopIdSource: (jddj && jddj.shopIdSource) || null,
        ok: !!(jddj && jddj.ok),
        error: (jddj && jddj.error) || null,
        businessStatus: (jddj && jddj.businessStatus) || null,
        cookieCount: cookies.length,
        cookieFallbackAttempted
      }
      if (jddj && jddj.shopId) {
        logNative('[jddj] shopId resolved after scrape+cookie', jddjMeta)
      } else {
        warnNative('[jddj] shopId missing after scrape+cookie', jddjMeta)
      }
      try {
        await persistSiteSnapshot(id, jddj, token)
        logNative('jddj.api.site-snapshot', {
          runId,
          envId: id,
          ok: !!token,
          skipped: !token,
          reason: token ? null : 'no-token'
        })
      } catch (err) {
        warnNative('jddj.api.site-snapshot', {
          runId,
          envId: id,
          error: err.message
        })
        if (jddj && typeof jddj === 'object') {
          jddj = {
            ...jddj,
            persistError: err.message
          }
        }
      }
    }

    // 6) 打包并上传（仅到家已登录：Cookie 含 user）
    try {
      const workerDir = path.join(getWorkersRoot(), id)
      const outDir = profileSync.getSnapshotsDir(id)
      ensureDir(outDir)
      const outPath = path.join(outDir, `profile-session-${Date.now()}.zip`)
      const packed = profileSync.packProfile(workerDir, { outputPath: outPath })
      const loggedIn = !!cookiesResult.loggedIn
      if (!token) {
        upload = { ok: false, skipped: true, reason: 'no-token', path: packed.path }
        warnNative('jddj.profile.pack', {
          runId,
          envId: id,
          skipped: true,
          reason: 'no-token',
          loggedIn,
          path: packed.path,
          size: packed.size
        })
      } else if (!loggedIn) {
        upload = { ok: false, skipped: true, reason: 'no-user-cookie', path: packed.path }
        warnNative('jddj.profile.pack', {
          runId,
          envId: id,
          skipped: true,
          reason: 'no-user-cookie',
          loggedIn: false,
          path: packed.path,
          size: packed.size
        })
      } else {
        const meta = await runtime.uploadPackedSnapshot(id, packed.path, req)
        upload = { ok: true, meta, path: packed.path, size: packed.size }
        logNative('jddj.profile.pack', {
          runId,
          envId: id,
          ok: true,
          loggedIn: true,
          path: packed.path,
          size: packed.size,
          version: meta && meta.version
        })
      }
    } catch (err) {
      upload = { ok: false, error: (err && err.message) || String(err) }
      warnNative('jddj.profile.pack', { runId, envId: id, error: upload.error })
    }

    return {
      ok: true,
      runId,
      envId: id,
      scrape,
      pull,
      cookieCount: cookiesResult.cookieCount,
      upload,
      jddj,
      elapsedMs: Date.now() - startedAt,
      debuggingPort: port
    }
  } catch (err) {
    runError = (err && err.message) || String(err)
    errorNative('session-worker failed', {
      runId,
      envId: id,
      error: runError
    })
    throw err
  } finally {
    if (killTimer) clearTimeout(killTimer)
    try {
      await runtime.stopBrowser(id, req, {
        skipProfileUpload: !!(upload && upload.ok)
      })
      logNative('jddj.stop', {
        runId,
        envId: id,
        ok: true,
        skipProfileUpload: !!(upload && upload.ok)
      })
    } catch (err) {
      warnNative('jddj.stop', {
        runId,
        envId: id,
        error: err.message
      })
    }
    logNative('jddj.run.end', {
      runId,
      envId: id,
      ok: !runError,
      error: runError,
      totalMs: Date.now() - startedAt,
      shopId: (jddj && jddj.shopId) || null,
      shopIdSource: (jddj && jddj.shopIdSource) || null,
      uploadOk: !!(upload && upload.ok),
      uploadSkipped: !!(upload && upload.skipped)
    })
    // 给 exit handler 一点时间做 auto-pack（若尚未上传）
    await new Promise(r => setTimeout(r, 300))
    activeRunContext = prevCtx
  }
}

function runSessionKeepalive(runtime, envId, req, options = {}) {
  return enqueue(() =>
    runSessionJob(runtime, envId, req, { ...options, scrape: false })
  )
}

function runJddjFetch(runtime, envId, req, options = {}) {
  return enqueue(() =>
    runSessionJob(runtime, envId, req, { ...options, scrape: true })
  )
}

module.exports = {
  hasJddjUserCookie,
  readCookiesFromLocalProfile,
  isLocalProfileLoggedIn,
  MAX_CONCURRENT,
  DEFAULT_SESSION_TIMEOUT_MS,
  enqueue,
  runSessionKeepalive,
  runJddjFetch,
  runSessionJob,
  writeCookiesToLocalProfile,
  persistSiteSnapshot,
  persistCookiesToBackend,
  syncCookiesFromCdp,
  getQueueStats: () => ({ active, pending: queue.length })
}
