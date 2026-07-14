const assert = require('assert')
const { handleNativeIpc, nativeRuntime } = require('../src/native-ipc')

async function testNativeRuntimeImport() {
  assert.strictEqual(typeof nativeRuntime.handleNativeCall, 'function')
  assert.strictEqual(typeof nativeRuntime.launchBrowser, 'function')
  // profile-sync / crx-store 依赖；须能从 appRoot/server 解析（与安装目录布局一致）
  const path = require('path')
  const { appRoot } = require('../src/paths')
  const admZipPath = require.resolve('adm-zip', { paths: [path.join(appRoot, 'server')] })
  assert.ok(admZipPath && admZipPath.includes('adm-zip'))
  console.log('ok: native-runtime import from desktop-shell')
}

async function testHandleNativeIpcBasics() {
  const list = await handleNativeIpc({ name: 'getBrowserList', params: [] })
  assert.ok(list && list.data && Array.isArray(list.data.users))

  const version = await handleNativeIpc({ name: 'getBrowserVersion', params: [] })
  assert.ok(typeof version === 'string' && version.length > 0)

  const running = await handleNativeIpc({ name: 'getRuningBrowser', params: [] })
  assert.ok(Array.isArray(running))

  console.log('ok: handleNativeIpc basics')
}

async function main() {
  await testNativeRuntimeImport()
  await testHandleNativeIpcBasics()
  console.log('')
  console.log('desktop-shell-smoke: all passed')
}

main().catch(err => {
  console.error('desktop-shell-smoke failed:', err)
  process.exit(1)
})
