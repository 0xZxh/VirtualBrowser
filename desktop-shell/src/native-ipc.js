const { nativeRuntimePath } = require('./paths')
const nativeRuntime = require(nativeRuntimePath)

/**
 * 桌面壳 IPC 桥接：仅委托 native-runtime.handleNativeCall，不复制内部逻辑。
 * @param {{ name: string, params?: unknown[], authToken?: string }} payload
 */
async function handleNativeIpc(payload) {
  const { name, params = [], authToken } = payload || {}
  if (!name) {
    throw new Error('native IPC: missing name')
  }

  const req = authToken
    ? { headers: { authorization: `Bearer ${authToken}` } }
    : {}

  return nativeRuntime.handleNativeCall(name, params, req)
}

module.exports = {
  handleNativeIpc,
  nativeRuntime
}
