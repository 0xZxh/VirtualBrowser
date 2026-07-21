const assert = require('assert')

// 在设置 VB_DATA_ROOT 前先不 require native-runtime
const path = require('path')
const fs = require('fs')
const os = require('os')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-startup-url-'))
process.env.VB_DATA_ROOT = tmpRoot

const { getBrowserListFile, getGlobalDatFile } = require('../../../config/vb-paths')
const rt = require('../native-runtime')

const listFile = getBrowserListFile()
const globalFile = getGlobalDatFile()
fs.mkdirSync(path.dirname(listFile), { recursive: true })
fs.mkdirSync(path.dirname(globalFile), { recursive: true })

const custom = {
  id: 1,
  name: 'jd1',
  homepage: { mode: 1, value: 'https://www.jd.com/' }
}
assert.strictEqual(rt.resolveLaunchStartupUrl(custom), 'https://www.jd.com/')

const bare = {
  id: 2,
  homepage: { mode: 1, value: 'www.baidu.com' }
}
assert.strictEqual(rt.resolveLaunchStartupUrl(bare), 'https://www.baidu.com')

fs.writeFileSync(
  globalFile,
  JSON.stringify({ apiLink: 'https://api.ipgeolocation.io/ipgeo?apiKey=test' }),
  'utf8'
)
const def = { id: 3, homepage: { mode: 0, value: '' } }
const url = rt.resolveLaunchStartupUrl(def)
assert.ok(url.startsWith('chrome://virtual-worker/?apiLink='))
assert.ok(url.includes(encodeURIComponent('https://api.ipgeolocation.io/ipgeo?apiKey=test')))

// 清空 apiLink 后应落到自建默认（CLOUD_API_BASE 或 localhost:3001）+/api/ip-geo
process.env.CLOUD_API_BASE = 'http://cloud.example:3001'
fs.writeFileSync(globalFile, JSON.stringify({}), 'utf8')
const selfhostUrl = rt.resolveLaunchStartupUrl({ id: 4, homepage: { mode: 0 } })
assert.ok(selfhostUrl.startsWith('chrome://virtual-worker/?apiLink='))
assert.ok(
  selfhostUrl.includes(encodeURIComponent('http://cloud.example:3001/api/ip-geo')),
  `expected selfhost default, got ${selfhostUrl}`
)

// 已写入 global.dat 的默认也应持久化为自建
const seeded = JSON.parse(fs.readFileSync(globalFile, 'utf8'))
assert.strictEqual(seeded.apiLink, 'http://cloud.example:3001/api/ip-geo')
assert.strictEqual(seeded.Channel, 'selfhost')

console.log('ok: resolveLaunchStartupUrl')
