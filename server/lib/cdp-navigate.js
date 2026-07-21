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

module.exports = {
  waitForCdpReady,
  listTargets,
  navigateToUrl,
  cdpWsSend,
  cdpEvaluate,
  toCdpCookieParams,
  injectCookies
}
