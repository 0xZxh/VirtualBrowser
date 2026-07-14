const assert = require('assert')
const nativeRuntime = require('../native-runtime')

function testModuleLoads() {
  assert.strictEqual(typeof nativeRuntime.handleNativeCall, 'function')
  assert.strictEqual(typeof nativeRuntime.launchBrowser, 'function')
  assert.strictEqual(typeof nativeRuntime.stopBrowser, 'function')
  assert.strictEqual(typeof nativeRuntime.allocateDebugPort, 'function')
  assert.strictEqual(typeof nativeRuntime.releaseDebugPort, 'function')
  console.log('ok: module exports')
}

function testDebugPortPool() {
  const p1 = nativeRuntime.allocateDebugPort()
  const p2 = nativeRuntime.allocateDebugPort()
  assert.ok(p1 >= 19200 && p1 <= 19999)
  assert.ok(p2 >= 19200 && p2 <= 19999)
  assert.notStrictEqual(p1, p2)
  nativeRuntime.releaseDebugPort(p1)
  nativeRuntime.releaseDebugPort(p2)
  console.log('ok: allocateDebugPort / releaseDebugPort', p1, p2)
}

async function testHandleNativeCallBasics() {
  const list = await nativeRuntime.handleNativeCall('getBrowserList', [])
  assert.ok(list && list.data && Array.isArray(list.data.users))
  const version = await nativeRuntime.handleNativeCall('getBrowserVersion', [])
  assert.ok(typeof version === 'string' && version.length > 0)
  const running = await nativeRuntime.handleNativeCall('getRuningBrowser', [])
  assert.ok(Array.isArray(running))
  console.log('ok: getBrowserList / getBrowserVersion / getRuningBrowser')
}

async function main() {
  testModuleLoads()
  testDebugPortPool()
  await testHandleNativeCallBasics()
  console.log('')
  console.log('native-runtime-smoke: all passed')
}

main().catch(err => {
  console.error('native-runtime-smoke failed:', err)
  process.exit(1)
})
