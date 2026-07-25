/**
 * CDP helpers for fingerprint browser launch (Node built-ins only).
 * Used to force-navigate when the kernel ignores spawn URL args.
 */
const http = require('http')
const crypto = require('crypto')
const { URL } = require('url')
const {
  toCdpCookieParams,
  formatCdpCookieError
} = require('./cookie-normalize')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        timeout: options.timeout || 3000
      },
      res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode || 0, body })
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

async function waitForCdpReady(port, timeoutMs = 15000) {
  const started = Date.now()
  let lastErr = null
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await httpRequest(`http://127.0.0.1:${port}/json/version`)
      if (res.status === 200) return
      lastErr = new Error(`status ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await sleep(300)
  }
  throw new Error(
    `CDP 端口 ${port} 未就绪: ${(lastErr && lastErr.message) || 'unknown'}`
  )
}

async function listTargets(port) {
  const res = await httpRequest(`http://127.0.0.1:${port}/json/list`)
  if (res.status !== 200) {
    throw new Error(`json/list status ${res.status}`)
  }
  const data = JSON.parse(res.body || '[]')
  return Array.isArray(data) ? data : []
}

function sendWsTextFrame(socket, text) {
  const payload = Buffer.from(text, 'utf8')
  const maskKey = crypto.randomBytes(4)
  const masked = Buffer.alloc(payload.length)
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ maskKey[i % 4]
  }
  let header
  if (payload.length < 126) {
    header = Buffer.alloc(2)
    header[0] = 0x81
    header[1] = 0x80 | payload.length
  } else {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 0x80 | 126
    header.writeUInt16BE(payload.length, 2)
  }
  socket.write(Buffer.concat([header, maskKey, masked]))
}

/**
 * Minimal WebSocket client (text frames) for one CDP command/response.
 */
function cdpWsSend(wsUrl, method, params) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl)
    const key = crypto.randomBytes(16).toString('base64')
    const msgId = 1
    let socket = null
    let buffer = Buffer.alloc(0)
    let settled = false

    const timer = setTimeout(() => fail(new Error('CDP websocket timeout')), 10000)

    function cleanup() {
      clearTimeout(timer)
      if (socket) {
        socket.removeAllListeners()
        try {
          socket.destroy()
        } catch {
          //
        }
      }
    }

    function fail(err) {
      if (settled) return
      settled = true
      cleanup()
      reject(err)
    }

    function succeed(value) {
      if (settled) return
      settled = true
      cleanup()
      resolve(value)
    }

    function onData(chunk) {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 2) {
        const second = buffer[1]
        const masked = (second & 0x80) !== 0
        let len = second & 0x7f
        let offset = 2
        if (len === 126) {
          if (buffer.length < 4) return
          len = buffer.readUInt16BE(2)
          offset = 4
        } else if (len === 127) {
          if (buffer.length < 10) return
          len = Number(buffer.readBigUInt64BE(2))
          offset = 10
        }
        const maskLen = masked ? 4 : 0
        if (buffer.length < offset + maskLen + len) return
        let payload = buffer.slice(offset + maskLen, offset + maskLen + len)
        if (masked) {
          const mask = buffer.slice(offset, offset + 4)
          const out = Buffer.alloc(len)
          for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4]
          payload = out
        }
        buffer = buffer.slice(offset + maskLen + len)
        try {
          const msg = JSON.parse(payload.toString('utf8'))
          if (msg.id === msgId) {
            if (msg.error) fail(new Error(msg.error.message || 'CDP error'))
            else succeed(msg.result)
          }
        } catch {
          // ignore events / non-json
        }
      }
    }

    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key
      }
    })

    req.on('upgrade', (_res, sock) => {
      socket = sock
      socket.on('data', onData)
      socket.on('error', fail)
      socket.on('close', () => {
        if (!settled) fail(new Error('CDP websocket closed'))
      })
      sendWsTextFrame(socket, JSON.stringify({ id: msgId, method, params }))
    })
    req.on('error', fail)
    req.end()
  })
}

/**
 * Navigate an existing page (prefer virtual-worker) to url.
 * Fallback: PUT /json/new?url to open a new tab.
 */
async function navigateToUrl(port, url, timeoutMs = 15000) {
  await waitForCdpReady(port, timeoutMs)
  const targets = await listTargets(port)
  const pages = targets.filter(t => t.type === 'page')
  const preferred =
    pages.find(p => /virtual-worker/i.test(String(p.url || ''))) || pages[0]

  if (preferred && preferred.webSocketDebuggerUrl) {
    await cdpWsSend(preferred.webSocketDebuggerUrl, 'Page.navigate', { url })
    return { method: 'Page.navigate', targetId: preferred.id, url }
  }

  const encoded = encodeURI(url)
  const res = await httpRequest(`http://127.0.0.1:${port}/json/new?${encoded}`, {
    method: 'PUT',
    timeout: 5000
  })
  if (res.status >= 200 && res.status < 300) {
    return { method: 'json/new', url, body: res.body }
  }
  throw new Error(
    `无法导航到 ${url}: no page target and json/new status ${res.status}`
  )
}

/**
 * Runtime.evaluate on an existing page target; returns result.value (or full result).
 */
async function cdpEvaluate(port, expression, timeoutMs = 15000) {
  await waitForCdpReady(port, timeoutMs)
  const targets = await listTargets(port)
  const pages = targets.filter(t => t.type === 'page')
  const preferred =
    pages.find(p => /virtual-worker|example\.com|about:blank/i.test(String(p.url || ''))) ||
    pages[0]
  if (!preferred || !preferred.webSocketDebuggerUrl) {
    throw new Error('CDP: no page target for Runtime.evaluate')
  }
  const result = await cdpWsSend(preferred.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (result && result.exceptionDetails) {
    const msg =
      (result.exceptionDetails.exception && result.exceptionDetails.exception.description) ||
      result.exceptionDetails.text ||
      'evaluate exception'
    throw new Error(msg)
  }
  return result && result.result ? result.result.value : undefined
}

/**
 * Inject cookies via Network.setCookie on a page target.
 * Failures are collected; does not throw for individual cookie errors.
 */
async function injectCookies(port, cookies, timeoutMs = 15000) {
  const list = Array.isArray(cookies) ? cookies : []
  if (!list.length) return { ok: 0, fail: 0, errors: [] }

  await waitForCdpReady(port, timeoutMs)
  const targets = await listTargets(port)
  const pages = targets.filter(t => t.type === 'page')
  const preferred =
    pages.find(p => /virtual-worker|about:blank/i.test(String(p.url || ''))) || pages[0]
  if (!preferred || !preferred.webSocketDebuggerUrl) {
    throw new Error('CDP: no page target for Network.setCookie')
  }

  const wsUrl = preferred.webSocketDebuggerUrl
  let ok = 0
  let fail = 0
  const errors = []

  for (const raw of list) {
    const params = toCdpCookieParams(raw)
    if (!params) {
      fail++
      errors.push('invalid cookie entry')
      continue
    }
    try {
      const result = await cdpWsSend(wsUrl, 'Network.setCookie', params)
      if (result && result.success === false) {
        fail++
        errors.push(formatCdpCookieError(params, 'setCookie success=false'))
      } else {
        ok++
      }
    } catch (err) {
      fail++
      errors.push(
        formatCdpCookieError(params, (err && err.message) || String(err))
      )
    }
  }

  return { ok, fail, errors }
}

/**
 * Pick a page target; prefer URL matching preferUrlRe if provided.
 */
async function pickPageTarget(port, preferUrlRe) {
  const targets = await listTargets(port)
  const pages = targets.filter(t => t.type === 'page')
  if (!pages.length) return null
  if (preferUrlRe) {
    const hit = pages.find(p => preferUrlRe.test(String(p.url || '')))
    if (hit) return hit
  }
  return (
    pages.find(p => /virtual-worker|about:blank/i.test(String(p.url || ''))) ||
    pages[0]
  )
}

/**
 * Convert CDP Network.Cookie → local cookie field shape.
 */
function fromCdpCookie(cookie) {
  if (!cookie || typeof cookie !== 'object') return null
  const out = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain || '',
    path: cookie.path || '/',
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
    session: cookie.session != null ? !!cookie.session : !(cookie.expires > 0),
    sameSite: cookie.sameSite || ''
  }
  if (cookie.expires != null && Number(cookie.expires) > 0) {
    out.expires = Number(cookie.expires)
    out.expirationDate = Number(cookie.expires)
  }
  return out
}

/**
 * Network.getAllCookies on a page target.
 * @returns {Promise<{ cookies: object[], raw: object[] }>}
 */
async function getAllCookies(port, timeoutMs = 15000) {
  await waitForCdpReady(port, timeoutMs)
  const preferred = await pickPageTarget(port)
  if (!preferred || !preferred.webSocketDebuggerUrl) {
    throw new Error('CDP: no page target for Network.getAllCookies')
  }
  const session = await openCdpSession(preferred.webSocketDebuggerUrl, timeoutMs + 5000)
  try {
    await session.send('Network.enable', {}, 8000).catch(() => {})
    const result = await session.send('Network.getAllCookies', {}, timeoutMs)
    const raw = (result && result.cookies) || []
    const cookies = raw.map(fromCdpCookie).filter(Boolean)
    return { cookies, raw }
  } finally {
    session.close()
  }
}

/**
 * Long-lived CDP WebSocket for multi-command + event listening.
 */
function openCdpSession(wsUrl, idleTimeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const u = new URL(wsUrl)
    const key = crypto.randomBytes(16).toString('base64')
    let socket = null
    let buffer = Buffer.alloc(0)
    let nextId = 1
    const pending = new Map()
    const eventHandlers = new Map()
    let closed = false
    let idleTimer = null

    function resetIdle() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        failAll(new Error('CDP session idle timeout'))
        close()
      }, idleTimeoutMs)
    }

    function close() {
      if (closed) return
      closed = true
      if (idleTimer) clearTimeout(idleTimer)
      if (socket) {
        socket.removeAllListeners()
        try {
          socket.destroy()
        } catch {
          //
        }
      }
    }

    function failAll(err) {
      for (const [, p] of pending) {
        p.reject(err)
      }
      pending.clear()
    }

    function onData(chunk) {
      resetIdle()
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 2) {
        const second = buffer[1]
        const masked = (second & 0x80) !== 0
        let len = second & 0x7f
        let offset = 2
        if (len === 126) {
          if (buffer.length < 4) return
          len = buffer.readUInt16BE(2)
          offset = 4
        } else if (len === 127) {
          if (buffer.length < 10) return
          len = Number(buffer.readBigUInt64BE(2))
          offset = 10
        }
        const maskLen = masked ? 4 : 0
        if (buffer.length < offset + maskLen + len) return
        let payload = buffer.slice(offset + maskLen, offset + maskLen + len)
        if (masked) {
          const mask = buffer.slice(offset, offset + 4)
          const out = Buffer.alloc(len)
          for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4]
          payload = out
        }
        buffer = buffer.slice(offset + maskLen + len)
        try {
          const msg = JSON.parse(payload.toString('utf8'))
          if (msg.id != null && pending.has(msg.id)) {
            const p = pending.get(msg.id)
            pending.delete(msg.id)
            if (msg.error) p.reject(new Error(msg.error.message || 'CDP error'))
            else p.resolve(msg.result)
          } else if (msg.method) {
            const handlers = eventHandlers.get(msg.method) || []
            for (const h of handlers) {
              try {
                h(msg.params || {})
              } catch {
                //
              }
            }
          }
        } catch {
          //
        }
      }
    }

    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key
      }
    })

    req.on('upgrade', (_res, sock) => {
      socket = sock
      socket.on('data', onData)
      socket.on('error', err => {
        failAll(err)
        close()
      })
      socket.on('close', () => {
        failAll(new Error('CDP session closed'))
        close()
      })
      resetIdle()
      resolve({
        send(method, params = {}, timeoutMs = 15000) {
          if (closed || !socket) {
            return Promise.reject(new Error('CDP session closed'))
          }
          const id = nextId++
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              pending.delete(id)
              rej(new Error(`CDP ${method} timeout`))
            }, timeoutMs)
            pending.set(id, {
              resolve(v) {
                clearTimeout(timer)
                res(v)
              },
              reject(e) {
                clearTimeout(timer)
                rej(e)
              }
            })
            sendWsTextFrame(socket, JSON.stringify({ id, method, params }))
            resetIdle()
          })
        },
        on(method, handler) {
          if (!eventHandlers.has(method)) eventHandlers.set(method, [])
          eventHandlers.get(method).push(handler)
          return () => {
            const list = eventHandlers.get(method) || []
            const idx = list.indexOf(handler)
            if (idx >= 0) list.splice(idx, 1)
          }
        },
        close
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function matchUrlPatterns(url, patterns) {
  const list = Array.isArray(patterns) ? patterns : []
  if (!list.length) return true
  const s = String(url || '')
  return list.some(p => {
    if (!p) return false
    if (p instanceof RegExp) return p.test(s)
    return s.includes(String(p))
  })
}

/**
 * Enable Network domain and collect response bodies matching urlPatterns.
 * Optionally navigates to navigateUrl first.
 *
 * @param {number} port
 * @param {{
 *   urlPatterns?: Array<string|RegExp>,
 *   navigateUrl?: string,
 *   collectMs?: number,
 *   preferUrlRe?: RegExp,
 *   maxBodies?: number
 * }} [options]
 * @returns {Promise<{ bodies: Array<{ url: string, status: number, mimeType: string, body: string }>, pageUrl: string|null }>}
 */
async function collectNetworkResponses(port, options = {}) {
  const collectMs = options.collectMs != null ? Number(options.collectMs) : 12000
  const maxBodies = options.maxBodies != null ? Number(options.maxBodies) : 40
  await waitForCdpReady(port, 15000)
  const preferred = await pickPageTarget(port, options.preferUrlRe)
  if (!preferred || !preferred.webSocketDebuggerUrl) {
    throw new Error('CDP: no page target for network intercept')
  }

  const session = await openCdpSession(preferred.webSocketDebuggerUrl, collectMs + 30000)
  const bodies = []
  const seen = new Set()
  const pendingFetch = new Set()

  try {
    await session.send('Network.enable', {})
    await session.send('Page.enable', {}).catch(() => {})

    session.on('Network.responseReceived', params => {
      const response = params && params.response
      const requestId = params && params.requestId
      if (!response || !requestId) return
      if (!matchUrlPatterns(response.url, options.urlPatterns)) return
      if (seen.has(requestId) || bodies.length + pendingFetch.size >= maxBodies) return
      seen.add(requestId)
      pendingFetch.add(requestId)
      // slight delay so body is available
      setTimeout(() => {
        session
          .send('Network.getResponseBody', { requestId }, 8000)
          .then(result => {
            const body =
              result && result.base64Encoded
                ? Buffer.from(result.body || '', 'base64').toString('utf8')
                : String((result && result.body) || '')
            bodies.push({
              url: response.url,
              status: response.status || 0,
              mimeType: response.mimeType || '',
              body
            })
          })
          .catch(() => {})
          .finally(() => pendingFetch.delete(requestId))
      }, 200)
    })

    if (options.navigateUrl) {
      await session.send('Page.navigate', { url: options.navigateUrl })
    }

    const started = Date.now()
    while (Date.now() - started < collectMs) {
      if (bodies.length >= maxBodies && pendingFetch.size === 0) break
      await sleep(300)
    }
    // drain in-flight body fetches briefly
    const drainUntil = Date.now() + 2000
    while (pendingFetch.size > 0 && Date.now() < drainUntil) {
      await sleep(100)
    }

    return { bodies, pageUrl: preferred.url || null }
  } finally {
    session.close()
  }
}

/**
 * Runtime.evaluate on preferred page (url match first).
 */
async function cdpEvaluateOn(port, expression, options = {}) {
  const timeoutMs = options.timeoutMs != null ? options.timeoutMs : 15000
  await waitForCdpReady(port, timeoutMs)
  const preferred = await pickPageTarget(port, options.preferUrlRe)
  if (!preferred || !preferred.webSocketDebuggerUrl) {
    throw new Error('CDP: no page target for Runtime.evaluate')
  }
  const result = await cdpWsSend(preferred.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  })
  if (result && result.exceptionDetails) {
    const msg =
      (result.exceptionDetails.exception && result.exceptionDetails.exception.description) ||
      result.exceptionDetails.text ||
      'evaluate exception'
    throw new Error(msg)
  }
  return result && result.result ? result.result.value : undefined
}

module.exports = {
  waitForCdpReady,
  listTargets,
  navigateToUrl,
  cdpWsSend,
  cdpEvaluate,
  cdpEvaluateOn,
  toCdpCookieParams,
  fromCdpCookie,
  injectCookies,
  getAllCookies,
  pickPageTarget,
  openCdpSession,
  collectNetworkResponses,
  matchUrlPatterns
}
