/**
 * 从 Cookie / JSON 载荷中解析京东到家门店 ID（启发式，失败返回 null）。
 */

const SHOP_ID_COOKIE_KEYS = [
  'stationNo',
  'station_no',
  'store_id',
  'storeId',
  'shopId',
  'shop_id',
  'venderId',
  'vender_id',
  'orgCode',
  'org_code',
  'merchantId',
  'merchant_id'
]

const SHOP_ID_JSON_KEYS = [
  'shopId',
  'storeId',
  'stationId',
  'stationNo',
  'venderId',
  'orgCode',
  'merchantId'
]

function pickString(...candidates) {
  for (const c of candidates) {
    if (c == null) continue
    const s = String(c).trim()
    if (s) return s
  }
  return null
}

function normalizeCookieList(cookies) {
  if (!cookies) return []
  if (Array.isArray(cookies)) return cookies.filter(c => c && typeof c === 'object')
  if (typeof cookies === 'string') {
    const s = cookies.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.filter(c => c && typeof c === 'object')
    } catch {
      // name=value; name2=value2
      return s.split(/;\s*/).map(part => {
        const eq = part.indexOf('=')
        if (eq <= 0) return null
        return { name: part.slice(0, eq).trim(), value: part.slice(eq + 1).trim() }
      }).filter(Boolean)
    }
  }
  return []
}

/**
 * @param {unknown} cookies cookie 数组 / JSON 字符串 / Cookie 头
 * @returns {{ shopId: string|null, shopIdSource: string|null }}
 */
function parseShopIdFromCookies(cookies) {
  const list = normalizeCookieList(cookies)
  const byName = new Map()
  for (const c of list) {
    const name = String(c.name || '').trim()
    if (!name) continue
    byName.set(name.toLowerCase(), String(c.value != null ? c.value : '').trim())
  }
  for (const key of SHOP_ID_COOKIE_KEYS) {
    const val = byName.get(key.toLowerCase())
    if (val) {
      return { shopId: val, shopIdSource: `cookie:${key}` }
    }
  }
  // 部分平台把门店号嵌在 value JSON 里
  for (const c of list) {
    const raw = String(c.value != null ? c.value : '').trim()
    if (!raw || (raw[0] !== '{' && raw[0] !== '[')) continue
    try {
      const obj = JSON.parse(raw)
      const found = digShopId(obj)
      if (found.shopId) {
        return {
          shopId: found.shopId,
          shopIdSource: found.shopIdSource || `cookie-json:${c.name}`
        }
      }
    } catch {
      // ignore
    }
  }
  return { shopId: null, shopIdSource: null }
}

function digShopId(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) {
    return { shopId: null, shopIdSource: null }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = digShopId(item, depth + 1)
      if (found.shopId) return found
    }
    return { shopId: null, shopIdSource: null }
  }
  for (const key of SHOP_ID_JSON_KEYS) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const v = pickString(obj[key])
      if (v) return { shopId: v, shopIdSource: `json:${key}` }
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const found = digShopId(v, depth + 1)
      if (found.shopId) return found
    }
  }
  return { shopId: null, shopIdSource: null }
}

/**
 * 从抓取 JSON 载荷候选字段取 shopId。
 * @returns {{ shopId: string|null, shopIdSource: string|null }}
 */
function extractShopIdFromPayload(data) {
  return digShopId(data)
}

/**
 * 合并写入 siteSnapshot.jddj.shopId（不覆盖已有更准值时可传 preferExisting）。
 */
function mergeShopIdIntoSnapshot(siteSnapshot, shopId, shopIdSource, options = {}) {
  const preferExisting = options.preferExisting === true
  const snap = siteSnapshot && typeof siteSnapshot === 'object' ? { ...siteSnapshot } : {}
  const jddj = snap.jddj && typeof snap.jddj === 'object' ? { ...snap.jddj } : {}
  const existing = jddj.shopId != null ? String(jddj.shopId).trim() : ''
  const next = shopId != null ? String(shopId).trim() : ''
  if (!next) {
    snap.jddj = jddj
    return snap
  }
  if (preferExisting && existing) {
    snap.jddj = jddj
    return snap
  }
  jddj.shopId = next
  if (shopIdSource) jddj.shopIdSource = String(shopIdSource)
  snap.jddj = jddj
  return snap
}

module.exports = {
  SHOP_ID_COOKIE_KEYS,
  SHOP_ID_JSON_KEYS,
  parseShopIdFromCookies,
  extractShopIdFromPayload,
  mergeShopIdIntoSnapshot,
  pickString
}
