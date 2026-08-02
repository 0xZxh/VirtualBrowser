/**
 * smoke: applyCreateAutoRefreshDefaults / hasFormCookies 行为
 * node server/lib/__tests__/create-auto-refresh-defaults.js
 */
const assert = require('assert')

function applyCreateAutoRefreshDefaults(item) {
  if (!item || typeof item !== 'object') return item
  const cookie = item.cookie
  const hasCookies =
    cookie &&
    Number(cookie.mode) === 1 &&
    Array.isArray(cookie.value) &&
    cookie.value.length > 0
  if (!hasCookies) return item
  const hasAuto = item.autoJddj != null
  const hasRefresh = item.jddjAutoRefresh != null
  if (!hasAuto && !hasRefresh) {
    item.autoJddj = true
    item.jddjAutoRefresh = true
  } else if (!hasAuto) {
    item.autoJddj = !!item.jddjAutoRefresh
  } else if (!hasRefresh) {
    item.jddjAutoRefresh = !!item.autoJddj
  }
  return item
}

const a = applyCreateAutoRefreshDefaults({
  cookie: { mode: 1, value: [{ name: 'user', value: 'x' }] }
})
assert.strictEqual(a.autoJddj, true)
assert.strictEqual(a.jddjAutoRefresh, true)

const b = applyCreateAutoRefreshDefaults({
  cookie: { mode: 1, value: [{ name: 'user', value: 'x' }] },
  autoJddj: false,
  jddjAutoRefresh: false
})
assert.strictEqual(b.autoJddj, false)

const c = applyCreateAutoRefreshDefaults({
  cookie: { mode: 0, value: [] }
})
assert.strictEqual(c.autoJddj, undefined)

console.log('create-auto-refresh-defaults: ok')
