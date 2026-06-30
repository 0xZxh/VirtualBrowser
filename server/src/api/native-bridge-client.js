export function isNativeBridgeAvailable() {
  return typeof chrome !== 'undefined' && typeof chrome.send === 'function'
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

  const res = await fetch('/dev-native-bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, params })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `dev-native-bridge failed: ${res.status}`)
  }

  return res.json()
}
