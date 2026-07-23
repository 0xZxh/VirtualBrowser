/**
 * Shared cookie normalization for save path + CDP Network.setCookie.
 * Keeps domain / SameSite+Secure rules consistent across UI and native runtime.
 */

const DEFAULT_COOKIE_DOMAIN = '.jddj.com'

function sanitizeCookieDomain(domain) {
  let d = String(domain == null ? '' : domain).trim()
  if (!d) return d
  d = d.replace(/^https?:\/\//i, '')
  const slash = d.indexOf('/')
  if (slash >= 0) d = d.slice(0, slash)
  const q = d.indexOf('?')
  if (q >= 0) d = d.slice(0, q)
  if (d.startsWith('*.')) d = `.${d.slice(2)}`
  return d
}

/**
 * Derive cookie domain from homepage URL.
 * https://store.jddj.com/ → .jddj.com
 */
function domainFromHomepage(url) {
  const fallback = DEFAULT_COOKIE_DOMAIN
  if (url == null || String(url).trim() === '') return fallback
  try {
    let raw = String(url).trim()
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
    const host = new URL(raw).hostname
    if (!host) return fallback
    const parts = host.split('.').filter(Boolean)
    if (parts.length >= 2) return `.${parts.slice(-2).join('.')}`
    return host.startsWith('.') ? host : `.${host}`
  } catch {
    return fallback
  }
}

/**
 * Parse Cookie request-header style string: name=value; name2=value2
 */
function parseCookieHeader(str, options) {
  const text = String(str == null ? '' : str).trim()
  if (!text) return null
  const domain =
    options && options.domain != null && String(options.domain).trim()
      ? sanitizeCookieDomain(options.domain)
      : DEFAULT_COOKIE_DOMAIN
  const parts = text.split(';')
  const list = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim()
    if (!part) continue
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1)
    if (!name) continue
    list.push({
      name,
      value,
      domain,
      path: '/',
      sameSite: '',
      session: false,
      secure: false,
      httpOnly: false
    })
  }
  return list.length ? list : null
}

/**
 * Accept JSON cookie array (string or array) or Cookie header string.
 * Returns array or null.
 */
function parseCookieInput(raw, options) {
  if (Array.isArray(raw)) {
    return raw.length ? raw : null
  }
  if (raw == null) return null
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text) return null

  const domain =
    options && options.domain != null && String(options.domain).trim()
      ? sanitizeCookieDomain(options.domain)
      : options && options.homepage
        ? domainFromHomepage(options.homepage)
        : DEFAULT_COOKIE_DOMAIN

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.length ? parsed : null
  } catch {
    // not JSON
  }

  try {
    // eslint-disable-next-line no-eval
    const parsed = eval(`(${text})`)
    if (Array.isArray(parsed)) return parsed.length ? parsed : null
  } catch {
    // not JS array literal
  }

  return parseCookieHeader(text, { domain })
}

/**
 * Canonical SameSite for CDP: None | Lax | Strict.
 * Empty / invalid → undefined (omit from CDP params).
 */
function normalizeSameSite(sameSite) {
  if (sameSite == null) return undefined
  const s = String(sameSite).trim()
  if (!s) return undefined
  const lower = s.toLowerCase()
  if (lower === 'none') return 'None'
  if (lower === 'lax') return 'Lax'
  if (lower === 'strict') return 'Strict'
  return undefined
}

/**
 * Normalize one cookie for persistence / CDP.
 * Returns a shallow copy; does not mutate input.
 */
function normalizeCookieEntry(cookie) {
  if (!cookie || typeof cookie !== 'object') return cookie
  const out = { ...cookie }

  if (out.domain != null) {
    out.domain = sanitizeCookieDomain(out.domain)
  }

  const ss = normalizeSameSite(out.sameSite)
  if (ss) {
    out.sameSite = ss
  } else if (out.sameSite !== undefined) {
    // Keep empty string for form defaults; drop invalid values
    out.sameSite = ''
  }

  // Chrome: SameSite=None requires Secure
  if (ss === 'None' && out.secure !== true) {
    out.secure = true
  }

  return out
}

function normalizeCookieList(list) {
  if (!Array.isArray(list)) return list
  return list.map(c => normalizeCookieEntry(c))
}

/**
 * Map a cookie object (form / Chrome export) to CDP Network.setCookie params.
 */
function toCdpCookieParams(cookie) {
  if (!cookie || typeof cookie !== 'object') return null
  const normalized = normalizeCookieEntry(cookie)
  const name = normalized.name
  const value = normalized.value
  if (name == null || value == null) return null

  const params = {
    name: String(name),
    value: String(value)
  }
  if (normalized.domain) params.domain = String(normalized.domain)
  if (normalized.path) params.path = String(normalized.path)
  if (normalized.url) params.url = String(normalized.url)
  if (typeof normalized.httpOnly === 'boolean') params.httpOnly = normalized.httpOnly
  if (typeof normalized.secure === 'boolean') params.secure = normalized.secure

  const ss = normalizeSameSite(normalized.sameSite)
  if (ss) params.sameSite = ss

  // url fallback: https:// + domain without leading dot
  if (!params.url && params.domain) {
    const host = String(params.domain).replace(/^\./, '')
    if (host) {
      params.url = `https://${host}/`
    }
  }

  const expiresRaw =
    normalized.expires != null
      ? normalized.expires
      : normalized.expirationDate != null
        ? normalized.expirationDate
        : null
  if (expiresRaw != null) {
    const n = Number(expiresRaw)
    if (Number.isFinite(n) && n > 0) {
      // Chrome export often uses ms; CDP expects seconds since epoch
      params.expires = n > 1e12 ? Math.floor(n / 1000) : n
    }
  }
  return params
}

function formatCdpCookieError(params, detail) {
  const name = (params && params.name) || '?'
  const parts = [
    `sameSite=${params && params.sameSite != null ? params.sameSite : ''}`,
    `secure=${params && params.secure != null ? params.secure : ''}`,
    `domain=${params && params.domain != null ? params.domain : ''}`
  ]
  return `${name}: ${detail} (${parts.join(', ')})`
}

module.exports = {
  DEFAULT_COOKIE_DOMAIN,
  domainFromHomepage,
  parseCookieHeader,
  parseCookieInput,
  sanitizeCookieDomain,
  normalizeSameSite,
  normalizeCookieEntry,
  normalizeCookieList,
  toCdpCookieParams,
  formatCdpCookieError
}
