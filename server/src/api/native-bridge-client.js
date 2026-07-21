import { getToken } from '@/utils/auth'

/**
 * Electron 桌面壳通过 contextBridge 暴露 vbDesktop.invoke（Promise）。
 * 不能依赖 chrome.send：Chromium 预置 window.chrome，contextBridge 无法覆盖；
 * 且 contextIsolation 下 preload 无法回调页面 window.cr。
 */
export function isNativeBridgeAvailable() {
  return (
    (typeof window !== 'undefined' &&
      window.vbDesktop &&
      typeof window.vbDesktop.invoke === 'function') ||
    (typeof chrome !== 'undefined' && typeof chrome.send === 'function')
  )
}

export function isDevNativeBridgeMode() {
  return process.env.NODE_ENV === 'development' && !isNativeBridgeAvailable()
}

let devBridgeWarned = false

export async function devNativeBridgeSend(name, params) {
  if (!devBridgeWarned) {
    devBridgeWarned = true
    console.info(
      '[dev-native-bridge] localhost 二开模式：native 请求走 Node 桥接（可真实启动指纹内核）'
    )
  }

  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch('/dev-native-bridge', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, params })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `dev-native-bridge failed: ${res.status}`)
  }

  return res.json()
}
