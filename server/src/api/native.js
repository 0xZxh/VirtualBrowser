import { v4 as uuid_v4 } from 'uuid'
import { getToken } from '@/utils/auth'
import {
  createEnvironment,
  deleteEnvironment,
  fetchEnvironments,
  importEnvironments,
  updateEnvironment
} from '@/api/environment'
import {
  devNativeBridgeSend,
  isDevNativeBridgeMode,
  isNativeBridgeAvailable
} from './native-bridge-client'

/* eslint-disable */
window.cr = {}
cr.__callbacks = {}
cr.webUIResponse = function (cb, status, data) {
  const callbackFn = cr.__callbacks[cb]
  callbackFn && callbackFn(data)
}

window.updateLaunchState = function () {
  updateRuningState()
}

export async function chromeSendTimeout(name, timeout = 2000, ...params) {
  const pTimeOut = timeout => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        reject('timeout')
      }, timeout)
    })
  }
  const pCall = new Promise((resolve, reject) => {
    const callbackName = 'callback_' + uuid_v4()
    cr.__callbacks[callbackName] = data => {
      resolve(data)
    }

    const args = [callbackName].concat(params)
    console.log(`chrome.send("${name}", `, args, `)`)

    if (isDevNativeBridgeMode()) {
      devNativeBridgeSend(name, params)
        .then(data => {
          cr.webUIResponse(callbackName, 0, data)
        })
        .catch(reject)
      return
    }

    // Electron 桌面壳：vbDesktop.invoke 直接返回 Promise（无需 chrome.send / cr 回调）
    if (
      typeof window !== 'undefined' &&
      window.vbDesktop &&
      typeof window.vbDesktop.invoke === 'function'
    ) {
      window.vbDesktop.invoke(name, params).then(resolve).catch(reject)
      return
    }

    if (!isNativeBridgeAvailable()) {
      reject(
        new Error(
          'native bridge 不可用（vbDesktop.invoke / chrome.send）。开发二开请用 npm run dev（dev-native-bridge）；生产环境请在 VirtualBrowser 桌面壳内运行。'
        )
      )
      return
    }

    chrome.send(name, args)
  })

  return Promise.race([pCall, pTimeOut(timeout)])
}

export async function chromeSend(name, ...params) {
  return chromeSendTimeout(name, 2000, ...params)
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

export async function setGlobalData(key, value) {
  const GlobalData = await getGlobalData()
  GlobalData[key] = value

  localStorage.setItem('GlobalData', JSON.stringify(GlobalData))
  await chromeSend('setGlobalData', JSON.stringify(GlobalData)).catch(console.warn)
}

/** 自建 IP 库默认 URL：cloudApiBase + /api/ip-geo */
export async function getDefaultIpGeoApiLink() {
  try {
    const link = await chromeSend('getDefaultIpGeoApiLink')
    if (typeof link === 'string' && link.trim()) {
      return link.trim()
    }
  } catch {
    //
  }
  return 'http://localhost:3001/api/ip-geo'
}

function asBrowserListArray(raw) {
  if (Array.isArray(raw)) {
    return raw
  }
  if (raw && Array.isArray(raw.users)) {
    return raw.users
  }
  return []
}

function normalizeEnvironmentItem(item) {
  if (!item || typeof item !== 'object') {
    return item
  }

  const ua =
    item.ua && typeof item.ua === 'object'
      ? {
          ...item.ua,
          value: item.ua.value != null ? String(item.ua.value) : ''
        }
      : { mode: 0, value: '' }

  return {
    ...item,
    chrome_version: item.chrome_version != null && item.chrome_version !== '' ? item.chrome_version : '默认',
    proxy:
      item.proxy && typeof item.proxy === 'object'
        ? item.proxy
        : { mode: 0, value: '', protocol: 'HTTP', host: '', port: '', user: '', pass: '', API: '' },
    ua,
    'sec-ch-ua':
      item['sec-ch-ua'] && typeof item['sec-ch-ua'] === 'object'
        ? item['sec-ch-ua']
        : { mode: 0, value: [] }
  }
}

function normalizeBrowserList(list) {
  return asBrowserListArray(list).map(normalizeEnvironmentItem)
}

async function syncListToBridge(list) {
  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  // 多环境写 virtual.dat 可能超过默认 2s；失败必须抛出，避免 UI 假成功
  await chromeSendTimeout('setBrowserList', 30000, data)
}

async function fetchListFromBackend() {
  const res = await fetchEnvironments()
  return normalizeBrowserList(res.data || [])
}

let legacyMigrateDone = false

async function maybeMigrateLegacyEnvironments(backendList) {
  if (legacyMigrateDone || backendList.length > 0) {
    return backendList
  }

  const roles = require('@/store').default.getters.roles || []
  if (!roles.includes('admin')) {
    return backendList
  }

  let localItems = []
  try {
    const cached = JSON.parse(localStorage.getItem('list'))
    localItems = (cached && cached.users) || []
  } catch {
    //
  }

  if (!localItems.length) {
    try {
      const bridge = await chromeSend('getBrowserList')
      localItems = asBrowserListArray((bridge && bridge.data) || bridge)
    } catch {
      //
    }
  }

  if (!localItems.length) {
    return backendList
  }

  try {
    const res = await importEnvironments(localItems)
    const imported = (res.data && res.data.imported) || 0
    if (imported > 0) {
      console.info(`[native] legacy 环境已导入 backend: ${imported} 条`)
      legacyMigrateDone = true
      return fetchListFromBackend()
    }
  } catch (err) {
    console.warn('[native] legacy 环境导入失败', err)
  }

  return backendList
}

/** 登出时清空本机环境缓存，避免下一用户看到他人列表 */
export async function clearBrowserListCache() {
  localStorage.removeItem('list')
  legacyMigrateDone = false
  await chromeSend('setBrowserList', { users: [] }).catch(() => {})
}

export async function getBrowserList() {
  if (getToken()) {
    let list = await fetchListFromBackend()
    list = await maybeMigrateLegacyEnvironments(list)
    list = normalizeBrowserList(list)
    await syncListToBridge(list)
    return list
  }

  let list
  try {
    list = await chromeSend('getBrowserList')
    list = list && list.data
  } catch {
    //
  }

  if (!list) {
    try {
      list = JSON.parse(localStorage.getItem('list'))
    } catch {
      //
    }
  }

  return normalizeBrowserList(list)
}
export async function addBrowser(item, defaultName) {
  if (getToken()) {
    const prefix = defaultName ? defaultName + ' ' : ''
    if (!item.name) {
      item.name = prefix + (item.id || 'new')
    }
    const res = await createEnvironment(item)
    const envId = String((res.data && res.data.id) || item.id)
    await syncEnvCrxBindings(envId, item.crxIds || []).catch(console.warn)
    const list = await fetchListFromBackend()
    await syncListToBridge(list)
    return
  }

  const prefix = defaultName ? defaultName + ' ' : ''
  const list = await getBrowserList()
  const maxId = Math.max(0, Math.max(...list.map(item => item.id)))
  item.id = maxId + 1
  item.name = item.name || prefix + item.id

  list.push(item)

  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  await chromeSendTimeout('setBrowserList', 30000, data)
  await syncEnvCrxBindings(String(item.id), item.crxIds || []).catch(console.warn)
}
export async function updateBrowser(item) {
  if (getToken()) {
    await updateEnvironment(String(item.id), item)
    await syncEnvCrxBindings(String(item.id), item.crxIds || []).catch(console.warn)
    const list = await fetchListFromBackend()
    await syncListToBridge(list)
    return
  }

  const list = await getBrowserList()
  const idx = list.findIndex(it => it.id === item.id)
  list[idx] = item

  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  await chromeSendTimeout('setBrowserList', 30000, data)
  await syncEnvCrxBindings(String(item.id), item.crxIds || []).catch(console.warn)
}
export async function deleteBrowser(id) {
  if (getToken()) {
    await deleteEnvironment(String(id))
    await chromeSend('deleteBrowser', id).catch(() => {})
    const list = await fetchListFromBackend()
    await syncListToBridge(list)
    return
  }

  await chromeSend('deleteBrowser', id).catch(() => {})

  const list = await getBrowserList()
  const idx = list.findIndex(it => it.id === id)

  list.splice(idx, 1)

  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  await chromeSendTimeout('setBrowserList', 30000, data)
}

export async function updateRuningState() {
  const runingIds = await chromeSend('getRuningBrowser').catch(() => {})
  window._updateState && window._updateState(runingIds || [])
}

/** 订阅内核进程退出（桌面壳 IPC）；非 Electron 环境返回空卸载函数 */
export function onBrowserExited(callback) {
  if (
    typeof window !== 'undefined' &&
    window.vbDesktop &&
    typeof window.vbDesktop.onBrowserExited === 'function' &&
    typeof callback === 'function'
  ) {
    return window.vbDesktop.onBrowserExited(callback)
  }
  return () => {}
}

export async function getBrowserVersion() {
  const ret = await chromeSend('getBrowserVersion')

  return ret
}

export async function packProfile(envId) {
  return chromeSend('packProfile', envId)
}

export async function unpackProfile(envId, zipPath) {
  return chromeSend('unpackProfile', envId, zipPath)
}

export async function getProfileLocalMeta(envId) {
  return chromeSend('getProfileLocalMeta', envId)
}

export async function getProfileSyncStatus(envId) {
  return chromeSendTimeout('getProfileSyncStatus', 15000, envId)
}

export async function syncProfileToCloud(envId) {
  return chromeSendTimeout('syncProfileToCloud', 300000, envId)
}

export async function syncProfileFromCloud(envId) {
  return chromeSendTimeout('syncProfileFromCloud', 300000, envId)
}

export async function syncEnvCrxBindings(envId, crxIds) {
  return chromeSend('syncEnvCrxBindings', envId, crxIds || [])
}

export async function getLocalCrxList() {
  const ret = await chromeSend('getLocalCrxList')
  return (ret && ret.data && ret.data.list) || []
}

export async function getCrxList() {
  return getLocalCrxList()
}

export async function setCrxList(list) {
  return chromeSend('setCrxList', { list })
}

export async function addLocalCrx(payload) {
  return chromeSend('addLocalCrx', payload)
}

export async function deleteLocalCrx(id) {
  return chromeSend('deleteLocalCrx', id)
}

export async function enableLocalCrx(id, enabled) {
  return chromeSend('enableLocalCrx', id, enabled)
}

export async function updateCrx(id) {
  return chromeSend('updateCrx', id)
}

export async function getCrxEnvironments(crxId) {
  return chromeSend('getCrxEnvironments', crxId)
}

export async function updateCrxEnvironments(crxId, envIds) {
  return chromeSend('updateCrxEnvironments', crxId, envIds)
}

export async function getGroupList() {
  let list
  try {
    list = JSON.parse(localStorage.getItem('group'))
  } catch {
    //
  }

  return list || []
}
export async function addGroup(item, defaultName) {
  const list = await getGroupList()
  const maxId = Math.max(0, Math.max(...list.map(item => item.id)))
  item.id = maxId + 1
  item.name = item.name || defaultName + ' ' + item.id

  list.push(item)

  localStorage.setItem('group', JSON.stringify(list))
}
export async function updateGroup(item) {
  const list = await getGroupList()
  const idx = list.findIndex(it => it.id === item.id)
  list[idx] = item

  localStorage.setItem('group', JSON.stringify(list))
}
export async function deleteGroup(id) {
  const list = await getGroupList()
  const idx = list.findIndex(it => it.id === id)

  list.splice(idx, 1)

  localStorage.setItem('group', JSON.stringify(list))
}
