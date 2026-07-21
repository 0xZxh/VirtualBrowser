const { contextBridge, ipcRenderer } = require('electron')

const TOKEN_KEY = 'Admin-Token'

function readAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function invokeNative(name, params) {
  return ipcRenderer.invoke('native-call', {
    name,
    params,
    authToken: readAuthToken()
  })
}

/**
 * 桌面壳桥接（contextIsolation 下不可覆盖 window.chrome，也不可从 preload 写 page 的 window.cr）。
 * 渲染进程应优先调用 vbDesktop.invoke(name, params) → Promise。
 */
contextBridge.exposeInMainWorld('vbDesktop', {
  invoke: (name, params = []) => invokeNative(name, params),
  /**
   * @param {(payload: { envId: string }) => void} callback
   * @returns {() => void} unsubscribe
   */
  onBrowserExited: callback => {
    if (typeof callback !== 'function') {
      return () => {}
    }
    const handler = (_event, payload) => {
      callback(payload || {})
    }
    ipcRenderer.on('browser-exited', handler)
    return () => {
      ipcRenderer.removeListener('browser-exited', handler)
    }
  }
})
