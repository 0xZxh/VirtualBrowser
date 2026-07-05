const fs = require('fs')
const path = require('path')
const profileSync = require('./profile-sync')

const CLOUD_API_BASE = (process.env.CLOUD_API_BASE || 'http://localhost:3001').replace(/\/$/, '')

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

async function getSnapshotMeta(envId, token) {
  const url = `${CLOUD_API_BASE}/api/profiles/${encodeURIComponent(envId)}/snapshot/meta`
  const res = await fetch(url, { headers: authHeaders(token) })

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
  const url = `${CLOUD_API_BASE}/api/profiles/${encodeURIComponent(envId)}/snapshot`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Content-Type': 'application/zip',
      'Content-Length': String(buffer.length)
    },
    body: buffer
  })

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
  const url = `${CLOUD_API_BASE}/api/profiles/${encodeURIComponent(envId)}/snapshot`
  const res = await fetch(url, { headers: authHeaders(token) })

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

  if (!localCloudMeta || !localCloudMeta.version) {
    return { pull: true, reason: 'no-local-cloud-meta', cloudMeta, localCloudMeta }
  }

  if (cloudMeta.version > localCloudMeta.version) {
    return { pull: true, reason: 'cloud-newer', cloudMeta, localCloudMeta }
  }

  return { pull: false, reason: 'up-to-date', cloudMeta, localCloudMeta }
}

function getCloudApiBase() {
  return CLOUD_API_BASE
}

module.exports = {
  getCloudApiBase,
  getSnapshotMeta,
  uploadSnapshot,
  downloadSnapshot,
  shouldPullFromCloud,
  readLocalCloudMeta,
  writeLocalCloudMeta
}
