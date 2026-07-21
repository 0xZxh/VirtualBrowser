/**
 * Param smoke: bad cookie import shape → CDP-ready params.
 * Input: domain "*.baidu.com/" + sameSite None + secure false
 * Expect: domain ".baidu.com", secure true, url https://baidu.com/
 */
const assert = require('assert')
const {
  sanitizeCookieDomain,
  normalizeCookieEntry,
  normalizeCookieList,
  toCdpCookieParams
} = require('../cookie-normalize')
const { toCdpCookieParams: viaCdpNavigate } = require('../cdp-navigate')

assert.strictEqual(sanitizeCookieDomain('*.baidu.com/'), '.baidu.com')
assert.strictEqual(sanitizeCookieDomain('https://*.baidu.com/path'), '.baidu.com')

const raw = {
  name: 'cookie1',
  value: '123A',
  domain: '*.baidu.com/',
  path: '/',
  secure: false,
  sameSite: 'None'
}

const normalized = normalizeCookieEntry(raw)
assert.strictEqual(normalized.domain, '.baidu.com')
assert.strictEqual(normalized.sameSite, 'None')
assert.strictEqual(normalized.secure, true)
assert.strictEqual(raw.secure, false, 'must not mutate input')

const params = toCdpCookieParams(raw)
assert.ok(params)
assert.strictEqual(params.domain, '.baidu.com')
assert.strictEqual(params.sameSite, 'None')
assert.strictEqual(params.secure, true)
assert.strictEqual(params.url, 'https://baidu.com/')
assert.strictEqual(params.name, 'cookie1')
assert.strictEqual(params.value, '123A')

const viaNav = viaCdpNavigate(raw)
assert.deepStrictEqual(viaNav, params)

const list = normalizeCookieList([
  raw,
  { name: 'cookie2', value: '2', domain: '.xxx.com', sameSite: 'Lax', secure: false }
])
assert.strictEqual(list[0].secure, true)
assert.strictEqual(list[1].sameSite, 'Lax')
assert.strictEqual(list[1].secure, false)

const withUrl = toCdpCookieParams({
  name: 'a',
  value: 'b',
  domain: '.example.com',
  url: 'https://www.example.com/',
  sameSite: 'none',
  secure: false
})
assert.strictEqual(withUrl.url, 'https://www.example.com/')
assert.strictEqual(withUrl.secure, true)

console.log('ok: cookie-normalize smoke')
console.log(
  JSON.stringify(
    { domain: params.domain, sameSite: params.sameSite, secure: params.secure, url: params.url },
    null,
    2
  )
)
