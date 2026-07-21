const path = require('path')
const fs = require('fs')
const os = require('os')
const assert = require('assert')

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vb-refresh-'))
process.env.VB_DATA_ROOT = tmpRoot

// 必须在设置 VB_DATA_ROOT 之后再 require
const { getBrowserListFile, getWorkersRoot } = require('../../../config/vb-paths')
const rt = require('../native-runtime')

const listFile = getBrowserListFile()
const workers = getWorkersRoot()
const tmpId = '42'
const tmpItem = {
  id: Number(tmpId),
  name: 'jd1',
  homepage: { mode: 1, value: 'https://www.jd.com/' }
}

fs.mkdirSync(path.dirname(listFile), { recursive: true })
fs.writeFileSync(listFile, JSON.stringify({ users: [tmpItem] }, null, 2), 'utf8')

rt.refreshWorkerVirtualDat(tmpId)
const written = JSON.parse(
  fs.readFileSync(path.join(workers, tmpId, 'virtual.dat'), 'utf8')
)
assert.strictEqual(written.users[0].homepage.value, 'https://www.jd.com/')
assert.strictEqual(String(written.users[0].id), tmpId)

let threw = false
try {
  rt.refreshWorkerVirtualDat('missing-id')
} catch (err) {
  threw = true
  assert.ok(String(err.message).includes('browser-list'))
}
assert.ok(threw, 'missing env should throw')

console.log('ok: refreshWorkerVirtualDat smoke')
console.log('tmpRoot', tmpRoot)
