import { v4 as uuid_v4 } from 'uuid'
import { getToken } from '@/utils/auth'
import {
  batchCreateEnvironments,
  batchDeleteEnvironments,
  batchUpdateEnvironmentGroup,
  createEnvironment,
  deleteEnvironment,
  fetchEnvironment,
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

function readLocalBridgeList() {
  try {
    const cached = JSON.parse(localStorage.getItem('list'))
    return asBrowserListArray(cached)
  } catch {
    return []
  }
}

async function syncListToBridge(list) {
  const data = { users: normalizeBrowserList(list) }
  localStorage.setItem('list', JSON.stringify(data))
  // 多环境写 virtual.dat 可能超过默认 2s；失败必须抛出，避免 UI 假成功
  await chromeSendTimeout('setBrowserList', 30000, data)
}

/** Upsert items into local bridge cache by id (does not drop unknown ids). */
export async function mergeSyncToBridge(items) {
  const incoming = normalizeBrowserList(items)
  if (!incoming.length) {
    return readLocalBridgeList()
  }
  const byId = new Map()
  for (const item of readLocalBridgeList()) {
    byId.set(String(item.id), item)
  }
  for (const item of incoming) {
    byId.set(String(item.id), item)
  }
  const merged = Array.from(byId.values())
  await syncListToBridge(merged)
  return merged
}

function removeIdsFromBridge(ids) {
  const idSet = new Set((ids || []).map(id => String(id)))
  return readLocalBridgeList().filter(item => !idSet.has(String(item.id)))
}

function parsePagePayload(data) {
  if (Array.isArray(data)) {
    return { items: normalizeBrowserList(data), total: data.length }
  }
  if (data && typeof data === 'object') {
    const items = normalizeBrowserList(data.items || [])
    const total = Number.isFinite(Number(data.total)) ? Number(data.total) : items.length
    return { items, total }
  }
  return { items: [], total: 0 }
}

async function fetchPageFromBackend(query = {}) {
  const page = Math.max(1, Number(query.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
  const params = { page, limit }
  if (query.group) params.group = query.group
  if (query.q) params.q = query.q
  const res = await fetchEnvironments(params)
  return parsePagePayload(res.data)
}

/** Fetch all pages (for group/admin helpers that still need full set). */
async function fetchAllFromBackend() {
  const pageSize = 100
  let page = 1
  let total = Infinity
  const all = []
  while (all.length < total) {
    const chunk = await fetchPageFromBackend({ page, limit: pageSize })
    total = chunk.total
    all.push(...chunk.items)
    if (!chunk.items.length) break
    page += 1
    if (page > 10000) break
  }
  return all
}

let legacyMigrateDone = false

async function maybeMigrateLegacyEnvironments(pageResult) {
  if (legacyMigrateDone || (pageResult && pageResult.total > 0)) {
    return pageResult
  }

  const roles = require('@/store').default.getters.roles || []
  if (!roles.includes('admin')) {
    return pageResult
  }

  let localItems = []
  try {
    localItems = readLocalBridgeList()
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
    return pageResult
  }

  try {
    const res = await importEnvironments(localItems)
    const imported = (res.data && res.data.imported) || 0
    if (imported > 0) {
      console.info(`[native] legacy 环境已导入 backend: ${imported} 条`)
      legacyMigrateDone = true
      return fetchPageFromBackend({ page: 1, limit: 20 })
    }
  } catch (err) {
    console.warn('[native] legacy 环境导入失败', err)
  }

  return pageResult
}

/** 登出时清空本机环境缓存，避免下一用户看到他人列表 */
export async function clearBrowserListCache() {
  localStorage.removeItem('list')
  legacyMigrateDone = false
  await chromeSend('setBrowserList', { users: [] }).catch(() => {})
}

/** Server-side page for browser list UI. */
export async function getBrowserListPage(query = {}) {
  if (!getToken()) {
    const all = await getBrowserList()
    let next = all.slice()
    const group = query.group != null ? String(query.group).trim() : ''
    const q = query.q != null ? String(query.q).trim() : ''
    if (group) {
      next = next.filter(item => item.group === group)
    }
    if (q) {
      const lower = q.toLowerCase()
      next = next.filter(item => {
        const name = String(item.name == null ? '' : item.name).toLowerCase()
        const id = String(item.id == null ? '' : item.id)
        return id === q || id.toLowerCase() === lower || name.includes(lower) || id.toLowerCase().includes(lower)
      })
    }
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.max(1, Number(query.limit) || 20)
    const start = (page - 1) * limit
    const items = next.slice(start, start + limit)
    await mergeSyncToBridge(items)
    return { items, total: next.length }
  }

  let result = await fetchPageFromBackend(query)
  if ((Number(query.page) || 1) === 1 && !query.group && !query.q) {
    result = await maybeMigrateLegacyEnvironments(result)
  }
  await mergeSyncToBridge(result.items)
  return result
}

export async function getBrowserList() {
  if (getToken()) {
    const list = await fetchAllFromBackend()
    await mergeSyncToBridge(list)
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

/** Ensure env config exists in local bridge before launch. */
export async function ensureEnvInBridge(envId) {
  const id = String(envId)
  const local = readLocalBridgeList()
  if (local.some(item => String(item.id) === id)) {
    return
  }
  if (!getToken()) {
    throw new Error('本地缓存中不存在该环境，无法启动')
  }
  const res = await fetchEnvironment(id)
  const item = res && res.data
  if (!item) {
    throw new Error('环境不存在')
  }
  await mergeSyncToBridge([item])
}

export async function addBrowser(item, defaultName) {
  if (getToken()) {
    const prefix = defaultName ? defaultName + ' ' : ''
    if (!item.name) {
      item.name = prefix + (item.id || 'new')
    }
    const res = await createEnvironment(item)
    const created = res.data
    const envId = String((created && created.id) || item.id)
    await syncEnvCrxBindings(envId, item.crxIds || []).catch(console.warn)
    if (created) {
      await mergeSyncToBridge([created])
    }
    return created
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
  return item
}
export async function updateBrowser(item) {
  if (getToken()) {
    const res = await updateEnvironment(String(item.id), item)
    await syncEnvCrxBindings(String(item.id), item.crxIds || []).catch(console.warn)
    const updated = (res && res.data) || item
    await mergeSyncToBridge([updated])
    return updated
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
    await syncListToBridge(removeIdsFromBridge([id]))
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

const IMPORT_BATCH_SIZE = 80

export async function batchAddBrowsers(items, defaultName) {
  const listItems = Array.isArray(items) ? items : []
  if (!listItems.length) {
    return { created: [] }
  }

  if (getToken()) {
    const prefix = defaultName ? defaultName + ' ' : ''
    const payload = listItems.map(item => {
      const next = { ...item }
      if (!next.name) {
        next.name = prefix + (next.id || 'new')
      }
      return next
    })
    const created = []
    for (let i = 0; i < payload.length; i += IMPORT_BATCH_SIZE) {
      const chunk = payload.slice(i, i + IMPORT_BATCH_SIZE)
      const res = await batchCreateEnvironments(chunk)
      const part = (res && res.data && res.data.created) || []
      created.push(...part)
      for (let j = 0; j < part.length; j++) {
        const env = part[j]
        const src = listItems[i + j] || {}
        await syncEnvCrxBindings(String(env.id), src.crxIds || []).catch(console.warn)
      }
      await mergeSyncToBridge(part)
    }
    return { created }
  }

  const list = await getBrowserList()
  let maxId = Math.max(0, ...list.map(item => Number(item.id) || 0))
  const prefix = defaultName ? defaultName + ' ' : ''
  const created = []
  for (const item of listItems) {
    maxId += 1
    const next = { ...item, id: maxId }
    next.name = next.name || prefix + next.id
    list.push(next)
    created.push(next)
    await syncEnvCrxBindings(String(next.id), next.crxIds || []).catch(console.warn)
  }
  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  await chromeSendTimeout('setBrowserList', 30000, data)
  return { created }
}

export async function batchDeleteBrowsers(ids) {
  const idList = (Array.isArray(ids) ? ids : []).map(id => String(id))
  if (!idList.length) {
    return { deleted: [], failed: [] }
  }

  if (getToken()) {
    const res = await batchDeleteEnvironments(idList)
    const result = (res && res.data) || { deleted: [], failed: [] }
    for (const id of result.deleted || []) {
      await chromeSend('deleteBrowser', id).catch(() => {})
    }
    await syncListToBridge(removeIdsFromBridge(result.deleted || []))
    return result
  }

  const deleted = []
  const failed = []
  let list = await getBrowserList()
  for (const id of idList) {
    try {
      await chromeSend('deleteBrowser', id).catch(() => {})
      const idx = list.findIndex(it => String(it.id) === id)
      if (idx >= 0) {
        list.splice(idx, 1)
        deleted.push(id)
      } else {
        failed.push({ id, message: '环境不存在' })
      }
    } catch (err) {
      failed.push({ id, message: err && err.message ? err.message : String(err) })
    }
  }
  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  await chromeSendTimeout('setBrowserList', 30000, data)
  return { deleted, failed }
}

export async function batchSetBrowserGroup(ids, group) {
  const idList = (Array.isArray(ids) ? ids : []).map(id => String(id))
  const nextGroup = String(group || '').trim() || '默认分组'
  if (!idList.length) {
    return { updated: [], failed: [] }
  }

  if (getToken()) {
    const res = await batchUpdateEnvironmentGroup(idList, nextGroup)
    const result = (res && res.data) || { updated: [], failed: [] }
    if (result.updated && result.updated.length) {
      await mergeSyncToBridge(result.updated)
    }
    return result
  }

  const updated = []
  const failed = []
  const list = await getBrowserList()
  for (const id of idList) {
    const idx = list.findIndex(it => String(it.id) === id)
    if (idx < 0) {
      failed.push({ id, message: '环境不存在' })
      continue
    }
    list[idx] = { ...list[idx], group: nextGroup }
    updated.push(list[idx])
  }
  const data = { users: list }
  localStorage.setItem('list', JSON.stringify(data))
  await chromeSendTimeout('setBrowserList', 30000, data)
  return { updated, failed }
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
