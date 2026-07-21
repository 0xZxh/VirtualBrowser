const fs = require('fs')
const path = require('path')
const profileSync = require('./profile-sync')

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
  const url = `${getCloudApiBase()}/api/profiles/${encodeURIComponent(envId)}/snapshot/meta`
  const res = await fetchWithTimeout(url, { headers: authHeaders(token) })

  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`获取云端 meta 失败 (${res.status}): ${text}`)
  }

  const json = await res.json()
  return json.data || json
}

async function uploadSnapshot(envId, zipPath, token) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`zip 不存在: ${zipPath}`)
  }

  const buffer = fs.readFileSync(zipPath)
  const url = `${getCloudApiBase()}/api/profiles/${encodeURIComponent(envId)}/snapshot`
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

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`上传快照失败 (${res.status}): ${text}`)
  }

  const json = await res.json()
  const meta = json.data || json
  writeLocalCloudMeta(envId, meta)
  return meta
}

async function downloadSnapshot(envId, workerDir, token) {
  const url = `${getCloudApiBase()}/api/profiles/${encodeURIComponent(envId)}/snapshot`
  const res = await fetchWithTimeout(url, { headers: authHeaders(token) }, 300000)

  if (res.status === 404) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
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
  readLocalCloudMeta,
  writeLocalCloudMeta
}
