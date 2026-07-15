const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')

const { getSnapshotsRoot } = require('../../config/vb-paths')

const snapshotsRoot = getSnapshotsRoot()

/** @type {Set<string>} */
const EXCLUDE_DIR_NAMES = new Set([
  'GPUCache',
  'ShaderCache',
  'GrShaderCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'GraphiteDawnCache',
  'AutofillAiModelCache',
  'optimization_guide_hint_cache_store'
])

const SYNC_ENTRY_PREFIXES = [
  'Network/Cookies',
  'Cookies',
  'Local Storage',
  'IndexedDB',
  'Session Storage',
  'Cache',
  'Code Cache',
  'Service Worker',
  'blob_storage'
]

const SKIP_FILE_NAMES = new Set([
  'LOCK',
  'LOG',
  'LOG.old',
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket'
])

function getSnapshotsDir(envId) {
  return path.join(snapshotsRoot, String(envId))
}

function isProfileDirName(name) {
  return name === 'Default' || name.startsWith('Profile ')
}

function normalizeRel(relPath) {
  return relPath.split(path.sep).join('/')
}

function shouldIncludeRelativePath(relPath) {
  const normalized = normalizeRel(relPath)
  const parts = normalized.split('/')
  if (parts.length < 2) return false
  if (!isProfileDirName(parts[0])) return false

  for (const segment of parts.slice(1)) {
    if (EXCLUDE_DIR_NAMES.has(segment)) return false
  }

  const baseName = path.basename(normalized)
  if (SKIP_FILE_NAMES.has(baseName) || baseName.endsWith('.lock')) return false

  const rest = parts.slice(1).join('/')
  return SYNC_ENTRY_PREFIXES.some(
    prefix => rest === prefix || rest.startsWith(`${prefix}/`)
  )
}

function walkSyncFiles(workerDir, onFile) {
  if (!fs.existsSync(workerDir)) return

  function walk(currentDir, relPrefix) {
    let entries
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const relPath = relPrefix ? path.join(relPrefix, entry.name) : entry.name
      if (entry.isDirectory()) {
        if (!relPrefix && !isProfileDirName(entry.name)) continue
        if (EXCLUDE_DIR_NAMES.has(entry.name)) continue
        walk(path.join(currentDir, entry.name), relPath)
      } else if (entry.isFile() && shouldIncludeRelativePath(relPath)) {
        onFile(path.join(currentDir, entry.name), relPath)
      }
    }
  }

  walk(workerDir, '')
}

function getProfileLocalMeta(workerDir) {
  /** @type {Array<{path:string,size:number,mtime:string}>} */
  const files = []
  let totalSize = 0

  walkSyncFiles(workerDir, (absPath, relPath) => {
    const stat = fs.statSync(absPath)
    totalSize += stat.size
    files.push({
      path: normalizeRel(relPath),
      size: stat.size,
      mtime: stat.mtime.toISOString()
    })
  })

  files.sort((a, b) => a.path.localeCompare(b.path))

  return {
    workerDir,
    fileCount: files.length,
    totalSize,
    files,
    generatedAt: new Date().toISOString()
  }
}

function packProfile(workerDir, options = {}) {
  if (!fs.existsSync(workerDir)) {
    throw new Error(`Worker 目录不存在: ${workerDir}`)
  }

  const zip = new AdmZip()
  walkSyncFiles(workerDir, (absPath, relPath) => {
    zip.addLocalFile(absPath, path.dirname(normalizeRel(relPath)) || '')
  })

  const meta = getProfileLocalMeta(workerDir)

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true })
    zip.writeZip(options.outputPath)
    const size = fs.statSync(options.outputPath).size
    return { path: options.outputPath, size, meta }
  }

  const buffer = zip.toBuffer()
  return { buffer, size: buffer.length, meta }
}

function backupWorkerDir(workerDir) {
  const backupPath = `${workerDir}.backup.${Date.now()}`
  fs.cpSync(workerDir, backupPath, { recursive: true })
  return backupPath
}

function unpackProfile(workerDir, zipSource) {
  if (!fs.existsSync(workerDir)) {
    fs.mkdirSync(workerDir, { recursive: true })
  }

  let zip
  if (Buffer.isBuffer(zipSource)) {
    zip = new AdmZip(zipSource)
  } else if (typeof zipSource === 'string') {
    if (!fs.existsSync(zipSource)) {
      throw new Error(`Zip 不存在: ${zipSource}`)
    }
    zip = new AdmZip(zipSource)
  } else {
    throw new Error('zipSource 须为文件路径或 Buffer')
  }

  const backupPath = fs.existsSync(workerDir) ? backupWorkerDir(workerDir) : null
  zip.extractAllTo(workerDir, true)

  return {
    backupPath,
    workerDir,
    extracted: zip.getEntries().length,
    meta: getProfileLocalMeta(workerDir)
  }
}

function hasLocalSyncData(workerDir) {
  return getProfileLocalMeta(workerDir).fileCount > 0
}

module.exports = {
  getSnapshotsDir,
  getProfileLocalMeta,
  packProfile,
  unpackProfile,
  hasLocalSyncData,
  shouldIncludeRelativePath
}
