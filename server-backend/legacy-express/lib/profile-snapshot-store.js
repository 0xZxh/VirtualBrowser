const fs = require('fs')
const path = require('path')

const DATA_ROOT = path.join(__dirname, '../../data/profiles')

function getEnvDir(envId) {
  const safeId = String(envId).replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(DATA_ROOT, safeId)
}

function getSnapshotPath(envId) {
  return path.join(getEnvDir(envId), 'snapshot.zip')
}

function getMetaPath(envId) {
  return path.join(getEnvDir(envId), 'meta.json')
}

function readMeta(envId) {
  const metaPath = getMetaPath(envId)
  if (!fs.existsSync(metaPath)) return null
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
  } catch {
    return null
  }
}

function writeMeta(envId, meta) {
  const envDir = getEnvDir(envId)
  fs.mkdirSync(envDir, { recursive: true })
  fs.writeFileSync(getMetaPath(envId), JSON.stringify(meta, null, 2), 'utf8')
}

function getSnapshotMeta(envId) {
  const snapshotPath = getSnapshotPath(envId)
  if (!fs.existsSync(snapshotPath)) return null

  const stored = readMeta(envId)
  const stat = fs.statSync(snapshotPath)

  if (stored) {
    return {
      envId: String(envId),
      version: stored.version,
      size: stat.size,
      updatedAt: stored.updatedAt
    }
  }

  return {
    envId: String(envId),
    version: 1,
    size: stat.size,
    updatedAt: stat.mtime.toISOString()
  }
}

function saveSnapshot(envId, buffer) {
  const envDir = getEnvDir(envId)
  fs.mkdirSync(envDir, { recursive: true })

  const prev = readMeta(envId)
  const version = prev ? prev.version + 1 : 1
  const updatedAt = new Date().toISOString()

  fs.writeFileSync(getSnapshotPath(envId), buffer)

  const meta = {
    envId: String(envId),
    version,
    size: buffer.length,
    updatedAt
  }
  writeMeta(envId, meta)
  return meta
}

function openSnapshotStream(envId) {
  const snapshotPath = getSnapshotPath(envId)
  if (!fs.existsSync(snapshotPath)) return null
  return fs.createReadStream(snapshotPath)
}

function hasSnapshot(envId) {
  return fs.existsSync(getSnapshotPath(envId))
}

module.exports = {
  getSnapshotMeta,
  saveSnapshot,
  openSnapshotStream,
  hasSnapshot,
  getSnapshotPath
}
