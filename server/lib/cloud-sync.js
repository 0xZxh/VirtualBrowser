const fs = require('fs')
const path = require('path')
const profileSync = require('./profile-sync')
const { logNative, warnNative } = require('./file-logger')

function getCloudApiBase() {
  // 运行时读取：desktop-shell 可能在 require 本模块之后才写入 CLOUD_API_BASE
  return (process.env.CLOUD_API_BASE || 'http://localhost:3001').replace(/\/$/, '')
}

/** 自建 IP 地理查询默认 URL（cloudApiBase 已去尾斜杠） */
function getDefaultIpGeoApiLink() {
  return `${getCloudApiBase()}/api/ip-geo`
}

function authHeaders(token) {
  if (!token) {
    throw new Error('缺少 cloud API token')
  }
  return { Authorization: `Bearer ${token}` }
}

function getCloudMetaPath(envId) {
  return path.join(profileSync.getSnapshotsDir(envId), 'cloud-meta.json')
}

function readLocalCloudMeta(envId) {
  const file = getCloudMetaPath(envId)
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeLocalCloudMeta(envId, meta) {
  const dir = profileSync.getSnapshotsDir(envId)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getCloudMetaPath(envId), JSON.stringify(meta, null, 2), 'utf8')
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`cloud API 超时 (${timeoutMs}ms): ${url}`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function getSnapshotMeta(envId, token) {
  const apiPath = `/api/profiles/${encodeURIComponent(envId)}/snapshot/meta`
  const url = `${getCloudApiBase()}${apiPath}`
  const t0 = Date.now()
  const res = await fetchWithTimeout(url, { headers: authHeaders(token) })
  const elapsedMs = Date.now() - t0

  if (res.status === 404) {
    logNative('cloud.api', {
      method: 'GET',
      path: apiPath,
      status: 404,
      elapsedMs,
      envId: String(envId),
      result: 'no-snapshot'
    })
    return null
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    warnNative('cloud.api', {
      method: 'GET',
      path: apiPath,
      status: res.status,
      elapsedMs,
      envId: String(envId),
      error: text.slice(0, 200)
    })
    throw new Error(`获取云端 meta 失败 (${res.status}): ${text}`)
  }

  const json = await res.json()
  logNative('cloud.api', {
    method: 'GET',
    path: apiPath,
    status: res.status,
    elapsedMs,
    envId: String(envId)
  })
  return json.data || json
}

/**
 * 上传前版本闸门：云端 version 高于本机 cloud-meta 则拒绝（stale-local）。
 * @returns {{ ok: true } | { ok: false, reason: string, cloudMeta: object|null, localCloudMeta: object|null }}
 */
async function shouldUploadToCloud(envId, token) {
  let cloudMeta = null
  try {
    cloudMeta = await getSnapshotMeta(envId, token)
  } catch (err) {
    warnNative('cloud.upload.version-check', {
      envId: String(envId),
      error: (err && err.message) || String(err)
    })
    // meta 查询失败时不阻断上传（避免误伤）
    return { ok: true, reason: 'meta-check-failed', cloudMeta: null, localCloudMeta: null }
  }
  const localCloudMeta = readLocalCloudMeta(envId)
  if (
    cloudMeta &&
    cloudMeta.version != null &&
    localCloudMeta &&
    localCloudMeta.version != null &&
    Number(cloudMeta.version) > Number(localCloudMeta.version)
  ) {
    return {
      ok: false,
      reason: 'stale-local',
      cloudMeta,
      localCloudMeta
    }
  }
  return { ok: true, reason: 'ok', cloudMeta, localCloudMeta }
}

async function uploadSnapshot(envId, zipPath, token) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`zip 不存在: ${zipPath}`)
  }

  const gate = await shouldUploadToCloud(envId, token)
  if (!gate.ok) {
    warnNative('cloud.upload skipped', {
      envId: String(envId),
      reason: gate.reason || 'stale-local',
      localVersion: gate.localCloudMeta && gate.localCloudMeta.version,
      cloudVersion: gate.cloudMeta && gate.cloudMeta.version
    })
    const err = new Error(
      `本地快照版本落后于云端（本地 v${
        gate.localCloudMeta && gate.localCloudMeta.version
      } / 云端 v${gate.cloudMeta && gate.cloudMeta.version}），请先拉取再上传`
    )
    err.code = 'stale-local'
    err.reason = 'stale-local'
    err.cloudMeta = gate.cloudMeta
    err.localCloudMeta = gate.localCloudMeta
    throw err
  }

  const buffer = fs.readFileSync(zipPath)
  const apiPath = `/api/profiles/${encodeURIComponent(envId)}/snapshot`
  const url = `${getCloudApiBase()}${apiPath}`
  const t0 = Date.now()
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: {
        ...authHeaders(token),
        'Content-Type': 'application/zip',
        'Content-Length': String(buffer.length)
      },
      body: buffer
    },
    300000
  )
  const elapsedMs = Date.now() - t0

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    warnNative('cloud.api', {
      method: 'POST',
      path: apiPath,
      status: res.status,
      elapsedMs,
      envId: String(envId),
      bytes: buffer.length,
      error: text.slice(0, 200)
    })
    throw new Error(`上传快照失败 (${res.status}): ${text}`)
  }

  const json = await res.json()
  const meta = json.data || json
  writeLocalCloudMeta(envId, meta)
  logNative('cloud.api', {
    method: 'POST',
    path: apiPath,
    status: res.status,
    elapsedMs,
    envId: String(envId),
    bytes: buffer.length,
    version: meta && meta.version
  })
  return meta
}

async function downloadSnapshot(envId, workerDir, token) {
  const apiPath = `/api/profiles/${encodeURIComponent(envId)}/snapshot`
  const url = `${getCloudApiBase()}${apiPath}`
  const t0 = Date.now()
  const res = await fetchWithTimeout(url, { headers: authHeaders(token) }, 300000)
  const elapsedMs = Date.now() - t0

  if (res.status === 404) {
    logNative('cloud.api', {
      method: 'GET',
      path: apiPath,
      status: 404,
      elapsedMs,
      envId: String(envId),
      result: 'no-snapshot'
    })
    return null
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    warnNative('cloud.api', {
      method: 'GET',
      path: apiPath,
      status: res.status,
      elapsedMs,
      envId: String(envId),
      error: text.slice(0, 200)
    })
    throw new Error(`下载快照失败 (${res.status}): ${text}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const version = res.headers.get('x-profile-version')
  const updatedAt = res.headers.get('x-profile-updated-at')

  const tmpDir = profileSync.getSnapshotsDir(envId)
  fs.mkdirSync(tmpDir, { recursive: true })
  const tmpZip = path.join(tmpDir, `cloud-pull-${Date.now()}.zip`)
  fs.writeFileSync(tmpZip, buffer)

  const result = profileSync.unpackProfile(workerDir, tmpZip)

  const meta = {
    envId: String(envId),
    version: version ? Number(version) : undefined,
    updatedAt: updatedAt || new Date().toISOString(),
    pulledAt: new Date().toISOString(),
    zipPath: tmpZip
  }
  writeLocalCloudMeta(envId, meta)

  logNative('cloud.api', {
    method: 'GET',
    path: apiPath,
    status: res.status,
    elapsedMs,
    envId: String(envId),
    bytes: buffer.length,
    version: meta.version,
    extracted: result && result.extracted
  })
  return { ...result, cloudMeta: meta }
}

async function shouldPullFromCloud(envId, workerDir, token) {
  const cloudMeta = await getSnapshotMeta(envId, token)
  if (!cloudMeta) return { pull: false, reason: 'no-cloud-snapshot', cloudMeta: null }

  const localCloudMeta = readLocalCloudMeta(envId)
  const hasLocal = profileSync.hasLocalSyncData(workerDir)

  if (!hasLocal) {
    return { pull: true, reason: 'no-local-data', cloudMeta, localCloudMeta }
  }

  // 本地已有 profile 但尚无 cloud meta：保留本机数据，避免被云端 zip 覆盖导致「无缓存」
  if (!localCloudMeta || localCloudMeta.version == null) {
    return { pull: false, reason: 'local-without-meta', cloudMeta, localCloudMeta }
  }

  if (cloudMeta.version > localCloudMeta.version) {
    return { pull: true, reason: 'cloud-newer', cloudMeta, localCloudMeta }
  }

  return { pull: false, reason: 'up-to-date', cloudMeta, localCloudMeta }
}

module.exports = {
  getCloudApiBase,
  getDefaultIpGeoApiLink,
  getSnapshotMeta,
  uploadSnapshot,
  downloadSnapshot,
  shouldPullFromCloud,
  shouldUploadToCloud,
  readLocalCloudMeta,
  writeLocalCloudMeta
}
