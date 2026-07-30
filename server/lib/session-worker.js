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
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal })
    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    if (!res.ok) {
      throw new Error(
        `cloud API ${method} ${apiPath} failed (${res.status}): ${text.slice(0, 200)}`
      )
    }
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
 * CDP 读 cookie → 写本地 profile + 后端（fail-soft 由调用方 catch）。
 * @returns {{ cookieCount: number, cookies: object[] }}
 */
async function syncCookiesFromCdp(envId, port, token, options = {}) {
  const timeoutMs = options.timeoutMs != null ? Number(options.timeoutMs) : 15000
  const all = await cdpNavigate.getAllCookies(port, timeoutMs)
  const cookies = all.cookies || []
  const local = writeCookiesToLocalProfile(envId, cookies)
  try {
    await persistCookiesToBackend(envId, cookies, token)
  } catch (err) {
    warnNative('persist cookies to backend failed', {
      envId: String(envId),
      error: (err && err.message) || String(err)
    })
  }
  return { cookieCount: local.cookieCount, cookies }
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

  logNative('session-worker start', { envId: id, scrape, entryUrl })

  const runningIds = runtime.getRunningIds()
  if (runningIds.includes(id)) {
    throw new Error(`环境 ${id} 已在运行，请先关闭后再跑会话任务`)
  }

  // 1) 云端较新则 pull（超时 fail-soft）
  let pull = { attempted: false, ok: false, error: null }
  try {
    pull.attempted = true
    await withTimeout(
      runtime.pullProfileIfNeeded(id, req, { timeoutMs: pullTimeoutMs }),
      pullTimeoutMs + 2000,
      'pullProfileIfNeeded'
    )
    pull.ok = true
  } catch (err) {
    pull.error = (err && err.message) || String(err)
    warnNative('session pull fail-soft', { envId: id, error: pull.error })
  }

  let launchResult = null
  let killTimer = null
  let cookiesResult = { cookieCount: 0 }
  let upload = { ok: false, skipped: false, error: null }
  let jddj = null

  try {
    // 2) 启动（最小化 / headless 降级；跳过默认 startup 导航）
    launchResult = await runtime.launchBrowser(id, req, {
      headlessHint: true,
      minimize: true,
      skipUiNavigate: true,
      skipCloudPull: true, // 上面已单独 pull
      sessionMode: true,
      autoCloseMs: sessionTimeoutMs
    })

    const port = launchResult && launchResult.debuggingPort
    if (!port) {
      throw new Error('会话启动成功但无 debuggingPort')
    }

    // 强制超时杀进程
    killTimer = setTimeout(() => {
      warnNative('session timeout kill', { envId: id, sessionTimeoutMs })
      runtime.stopBrowser(id, req).catch(() => {})
    }, sessionTimeoutMs)

    // 3) 打开到家后台
    await cdpNavigate.navigateToUrl(port, entryUrl, 20000)
    await new Promise(r => setTimeout(r, 2000))

    // 4) Cookie 写回
    let cookies = []
    try {
      const synced = await syncCookiesFromCdp(id, port, token, { timeoutMs: 15000 })
      cookiesResult = { cookieCount: synced.cookieCount }
      cookies = synced.cookies || []
    } catch (err) {
      warnNative('session cookie sync failed', {
        envId: id,
        error: (err && err.message) || String(err)
      })
    }

    // 5) 抓取（可选）
    if (scrape) {
      jddj = await jddjScraper.scrapeJddj(port, {
        entryUrl,
        collectMs: options.collectMs
      })
      // 抓取仍无 shopId 时，用 cookie 补全
      if (jddj && !jddj.shopId && cookies.length) {
        const found = parseShopIdFromCookies(cookies)
        if (found.shopId) {
          jddj = {
            ...jddj,
            shopId: found.shopId,
            shopIdSource: found.shopIdSource || 'cookie'
          }
        }
      }
      try {
        await persistSiteSnapshot(id, jddj, token)
      } catch (err) {
        warnNative('persist site-snapshot failed', {
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

    // 6) 打包并上传（与正常退出一致）
    try {
      const workerDir = path.join(getWorkersRoot(), id)
      const outDir = profileSync.getSnapshotsDir(id)
      ensureDir(outDir)
      const outPath = path.join(outDir, `profile-session-${Date.now()}.zip`)
      const packed = profileSync.packProfile(workerDir, { outputPath: outPath })
      if (token) {
        const meta = await runtime.uploadPackedSnapshot(id, packed.path, req)
        upload = { ok: true, meta, path: packed.path }
      } else {
        upload = { ok: false, skipped: true, reason: 'no-token', path: packed.path }
      }
    } catch (err) {
      upload = { ok: false, error: (err && err.message) || String(err) }
      warnNative('session upload failed', { envId: id, error: upload.error })
    }

    return {
      ok: true,
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
    errorNative('session-worker failed', {
      envId: id,
      error: (err && err.message) || String(err)
    })
    throw err
  } finally {
    if (killTimer) clearTimeout(killTimer)
    try {
      await runtime.stopBrowser(id, req)
    } catch (err) {
      warnNative('session stopBrowser failed', {
        envId: id,
        error: err.message
      })
    }
    // 给 exit handler 一点时间做 auto-pack（若尚未上传）
    await new Promise(r => setTimeout(r, 300))
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
