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
 * 与 server/src/api/native.js 中 chrome.send 回调协议一致：
 * args = [callbackName, ...params]
 */
function chromeSend(name, args) {
  const list = Array.isArray(args) ? args : []
  const callbackName = list[0]
  const params = list.slice(1)

  invokeNative(name, params)
    .then(data => {
      if (typeof window.cr !== 'undefined' && typeof window.cr.webUIResponse === 'function') {
        window.cr.webUIResponse(callbackName, 0, data)
      }
    })
    .catch(err => {
      console.error('[desktop-shell preload] native-call failed:', name, err)
      if (typeof window.cr !== 'undefined' && typeof window.cr.webUIResponse === 'function') {
        window.cr.webUIResponse(callbackName, 1, { error: String(err && err.message ? err.message : err) })
      }
    })
}

contextBridge.exposeInMainWorld('chrome', {
  send: chromeSend
})
