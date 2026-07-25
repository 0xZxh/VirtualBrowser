/**
 * Cookie parse helpers for H5 (mirrors server/lib/cookie-normalize.js).
 * Exposes window.VbCookieParse.
 */
;(function (global) {
  var DEFAULT_COOKIE_DOMAIN = '.jddj.com'

  function sanitizeCookieDomain(domain) {
    var d = String(domain == null ? '' : domain).trim()
    if (!d) return d
    d = d.replace(/^https?:\/\//i, '')
    var slash = d.indexOf('/')
    if (slash >= 0) d = d.slice(0, slash)
    var q = d.indexOf('?')
    if (q >= 0) d = d.slice(0, q)
    if (d.indexOf('*.') === 0) d = '.' + d.slice(2)
    return d
  }

  function domainFromHomepage(url) {
    var fallback = DEFAULT_COOKIE_DOMAIN
    if (url == null || String(url).trim() === '') return fallback
    try {
      var raw = String(url).trim()
      if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw
      var host = new URL(raw).hostname
      if (!host) return fallback
      var parts = host.split('.').filter(Boolean)
      if (parts.length >= 2) return '.' + parts.slice(-2).join('.')
      return host.charAt(0) === '.' ? host : '.' + host
    } catch (e) {
      return fallback
    }
  }

  function parseCookieHeader(str, options) {
    var text = String(str == null ? '' : str).trim()
    if (!text) return null
    if (text.charAt(0) === '[' || text.charAt(0) === '{') return null
    var domain =
      options && options.domain != null && String(options.domain).trim()
        ? sanitizeCookieDomain(options.domain)
        : DEFAULT_COOKIE_DOMAIN
    // 支持 ;、中文分号、换行分隔（Alook 等常带换行）
    var parts = text.split(/[;\uFF1B\r\n]+/)
    var list = []
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim()
      if (!part) continue
      var eq = part.indexOf('=')
      if (eq <= 0) continue
      var name = part.slice(0, eq).trim()
      var value = part.slice(eq + 1)
      if (!name) continue
      // 跳过 Set-Cookie 属性段（若误粘贴）
      if (/^(path|domain|expires|max-age|samesite|secure|httponly)$/i.test(name)) {
        continue
      }
      list.push({
        name: name,
        value: value == null ? '' : String(value),
        domain: domain,
        path: '/',
        sameSite: '',
        session: false,
        secure: false,
        httpOnly: false
      })
    }
    return list.length ? list : null
  }

  function normalizeCookieKeys(item) {
    if (!item || typeof item !== 'object') return null
    var cookie = {}
    Object.keys(item).forEach(function (key) {
      var newKey = key.substring(0, 1).toLowerCase() + key.substring(1)
      if (newKey.toLowerCase() === 'samesite') newKey = 'sameSite'
      cookie[newKey] = item[key]
    })
    if (cookie.name != null) cookie.name = String(cookie.name)
    if (cookie.value != null) cookie.value = String(cookie.value)
    else cookie.value = ''
    return cookie
  }

  function parseCookieInput(raw, options) {
    if (Array.isArray(raw)) {
      if (!raw.length) return null
      var mapped = []
      for (var i = 0; i < raw.length; i++) {
        var n = normalizeCookieKeys(raw[i])
        if (n && n.name) mapped.push(n)
      }
      return mapped.length ? mapped : null
    }
    if (raw == null) return null
    if (typeof raw !== 'string') return null
    var text = raw.trim()
    if (!text) return null

    var domain =
      options && options.domain != null && String(options.domain).trim()
        ? sanitizeCookieDomain(options.domain)
        : options && options.homepage
          ? domainFromHomepage(options.homepage)
          : DEFAULT_COOKIE_DOMAIN

    try {
      var parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parseCookieInput(parsed, options)
      }
    } catch (e) {
      // not JSON
    }

    return parseCookieHeader(text, { domain: domain })
  }

  global.VbCookieParse = {
    DEFAULT_COOKIE_DOMAIN: DEFAULT_COOKIE_DOMAIN,
    domainFromHomepage: domainFromHomepage,
    parseCookieHeader: parseCookieHeader,
    parseCookieInput: parseCookieInput,
    normalizeCookieKeys: normalizeCookieKeys
  }
})(typeof window !== 'undefined' ? window : this)
