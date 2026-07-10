import { v4 as uuid_v4 } from 'uuid'

/* eslint-disable */
window.cr = {}
cr.__callbacks = {}
cr.webUIResponse = function (cb, status, data) {
  const callbackFn = cr.__callbacks[cb]
  callbackFn && callbackFn(data)
}

export async function chromeSend(name, ...params) {
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
    GlobalData = parseGlobalDataPayload(bridge && bridge.data)
  } catch {
    //
  }

  return GlobalData
}
