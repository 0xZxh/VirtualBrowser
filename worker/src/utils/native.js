import { v4 as uuid_v4 } from 'uuid'

/* eslint-disable */
window.cr = {}
cr.__callbacks = {}
cr.webUIResponse = function (cb, status, data) {
  const callbackFn = cr.__callbacks[cb]
  callbackFn && callbackFn(data)
}

/** 普通浏览器预览（非 VirtualBrowser 内核内嵌页） */
export function isWorkerPreviewMode() {
  return typeof chrome === 'undefined' || typeof chrome.send !== 'function'
}

function previewChromeSend(name) {
  if (name === 'getGlobalData') {
    return { data: localStorage.getItem('GlobalData') || '{}' }
  }
  if (name === 'setGlobalData') {
    return { ok: true, preview: true }
  }
  if (name === 'setIpGeo') {
    // 预览模式：跳过写回内核
    return { ok: true, preview: true }
  }
  return { ok: true, preview: true }
}

export async function chromeSend(name, ...params) {
  if (isWorkerPreviewMode()) {
    return previewChromeSend(name, ...params)
  }

  const pTimeOut = timeout => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject('timeout')
      }, timeout)
    })
  }
  const pCall = new Promise(resolve => {
    const callbackName = 'callback_' + uuid_v4()
    cr.__callbacks[callbackName] = data => {
      resolve(data)
    }

    const args = [callbackName].concat(params)
    console.log(`chrome.send("${name}", ${JSON.stringify(args)})`)
    chrome.send(name, args)
  })

  return Promise.race([pCall, pTimeOut(2000)])
}

function parseGlobalDataPayload(raw) {
  if (raw == null || raw === '') {
    return {}
  }
  let data = raw
  for (let i = 0; i < 3; i++) {
    if (typeof data !== 'string') {
      break
    }
    try {
      data = JSON.parse(data)
    } catch {
      return {}
    }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {}
  }
  return data
}

export async function getGlobalData() {
  let GlobalData = {}
  try {
    GlobalData = parseGlobalDataPayload(localStorage.getItem('GlobalData'))
    const bridge = await chromeSend('getGlobalData')
    const fromBridge = parseGlobalDataPayload(bridge && bridge.data)
    if (Object.keys(fromBridge).length) {
      GlobalData = fromBridge
    }
  } catch {
    //
  }

  return GlobalData
}

export async function setGlobalData(patch) {
  const current = await getGlobalData()
  const next = { ...current, ...patch }
  localStorage.setItem('GlobalData', JSON.stringify(next))
  try {
    await chromeSend('setGlobalData', JSON.stringify(next))
  } catch {
    // preview ok
  }
  return next
}
