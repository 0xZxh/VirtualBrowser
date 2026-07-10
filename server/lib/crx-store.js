const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const vbRoot = path.join(process.env.LOCALAPPDATA || '', 'VirtualBrowser')
const userDataDir = path.join(vbRoot, 'User Data')
const listFile = path.join(userDataDir, 'crx-list.json')
const extensionsRoot = path.join(vbRoot, 'Extensions')

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function readList() {
  try {
    const raw = JSON.parse(fs.readFileSync(listFile, 'utf8'))
    if (Array.isArray(raw)) return raw
    if (raw && Array.isArray(raw.list)) return raw.list
  } catch {
    //
  }
  return []
}

function writeList(list) {
  ensureDir(userDataDir)
  fs.writeFileSync(listFile, JSON.stringify({ list }, null, 2), 'utf8')
}

function nextId() {
  return crypto.randomBytes(8).toString('hex')
}

function sanitizeName(name) {
  return String(name || 'extension')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .slice(0, 80)
}

function parseAddPayload(payload) {
  if (payload == null) {
    throw new Error('addLocalCrx 需要文件路径或 { name, base64 } 对象')
  }
  if (typeof payload === 'string') {
    return { sourcePath: payload }
  }
  if (typeof payload === 'object') {
    if (payload.url && !payload.base64 && !payload.path && !payload.filePath) {
      return {
        name: payload.name || payload.id || 'store-extension',
        url: payload.url,
        source: payload.source || 'chrome',
        catalogOnly: true
      }
    }
    if (payload.path || payload.filePath) {
      const sourcePath = payload.path || payload.filePath
      if (/^https?:\/\//i.test(sourcePath)) {
        return {
          name: payload.name || 'store-extension',
          url: sourcePath,
          source: payload.source || 'chrome',
          catalogOnly: true
        }
      }
      return { sourcePath, name: payload.name, source: payload.source }
    }
    if (payload.base64) {
      return {
        name: payload.name,
        base64: payload.base64,
        source: payload.source || 'local'
      }
    }
  }
  throw new Error('addLocalCrx 参数格式无效')
}

function getCrxList() {
  return { data: { list: readList() } }
}

function setCrxList(data) {
  const list = Array.isArray(data) ? data : (data && data.list) || []
  writeList(list)
  return { ok: true }
}

function addLocalCrx(payload) {
  const parsed = parseAddPayload(payload)
  ensureDir(extensionsRoot)

  if (parsed.catalogOnly) {
    const item = {
      id: nextId(),
      name: parsed.name,
      version: '',
      enabled: true,
      source: parsed.source || 'chrome',
      path: '',
      url: parsed.url,
      environments: [],
      size: 0,
      createdAt: Date.now()
    }
    const list = readList()
    list.push(item)
    writeList(list)
    return { ok: true, item, message: '已写入 catalog（商店下载待后续实现）' }
  }

  let targetPath
  let fileName
  let size = 0

  if (parsed.base64) {
    fileName = `${sanitizeName(parsed.name || 'upload')}-${Date.now()}.crx`
    targetPath = path.join(extensionsRoot, fileName)
    const buf = Buffer.from(parsed.base64, 'base64')
    fs.writeFileSync(targetPath, buf)
    size = buf.length
  } else {
    const sourcePath = path.resolve(parsed.sourcePath)
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`CRX 文件不存在: ${sourcePath}`)
    }
    fileName = path.basename(sourcePath)
    targetPath = path.join(extensionsRoot, `${Date.now()}-${fileName}`)
    fs.copyFileSync(sourcePath, targetPath)
    size = fs.statSync(targetPath).size
  }

  const item = {
    id: nextId(),
    name: parsed.name || path.basename(fileName, path.extname(fileName)),
    version: '',
    enabled: true,
    source: parsed.source || 'local',
    path: targetPath,
    url: '',
    environments: [],
    size,
    createdAt: Date.now()
  }

  const list = readList()
  list.push(item)
  writeList(list)
  return { ok: true, item }
}

function deleteLocalCrx(id) {
  const list = readList()
  const idx = list.findIndex(item => String(item.id) === String(id))
  if (idx === -1) {
    throw new Error(`插件不存在: ${id}`)
  }
  const [removed] = list.splice(idx, 1)
  writeList(list)
  if (removed && removed.path && fs.existsSync(removed.path)) {
    try {
      fs.unlinkSync(removed.path)
    } catch {
      //
    }
  }
  return { ok: true }
}

function enableLocalCrx(id, enabled) {
  const list = readList()
  const item = list.find(it => String(it.id) === String(id))
  if (!item) {
    throw new Error(`插件不存在: ${id}`)
  }
  item.enabled = enabled !== false && enabled !== 0 && enabled !== '0'
  writeList(list)
  return { ok: true, item }
}

function updateCrx(id) {
  const list = readList()
  const item = list.find(it => String(it.id) === String(id))
  if (!item) {
    throw new Error(`插件不存在: ${id}`)
  }
  item.updatedAt = Date.now()
  writeList(list)
  return { ok: true, item, message: '本地模式暂未实现商店更新，仅刷新元数据' }
}

function getBrowserIds() {
  const listFilePath = path.join(userDataDir, 'browser-list.json')
  try {
    const data = JSON.parse(fs.readFileSync(listFilePath, 'utf8'))
    return ((data && data.users) || []).map(u => u.id)
  } catch {
    return []
  }
}

function getCrxEnvironments(crxId) {
  const list = readList()
  const item = list.find(it => String(it.id) === String(crxId))
  if (!item) {
    throw new Error(`插件不存在: ${crxId}`)
  }
  const allIds = getBrowserIds().map(String)
  const assigned = (item.environments || []).map(String).filter(id => allIds.includes(id))
  const unassigned = allIds.filter(id => !assigned.includes(id))
  return { assigned, unassigned }
}

function updateCrxEnvironments(crxId, envIds) {
  const list = readList()
  const item = list.find(it => String(it.id) === String(crxId))
  if (!item) {
    throw new Error(`插件不存在: ${crxId}`)
  }
  item.environments = (envIds || []).map(String)
  writeList(list)
  return { ok: true, item }
}

function unpackCrxFile(crxPath, outDir) {
  const buf = fs.readFileSync(crxPath)
  let zipStart = 0

  if (buf.length >= 12 && buf.toString('utf8', 0, 4) === 'Cr24') {
    const version = buf.readUInt32LE(4)
    if (version === 2) {
      const pubLen = buf.readUInt32LE(8)
      const sigLen = buf.readUInt32LE(12)
      zipStart = 16 + pubLen + sigLen
    } else if (version === 3) {
      const headerSize = buf.readUInt32LE(8)
      zipStart = 12 + headerSize
    }
  }

  ensureDir(outDir)
  const zip = new AdmZip(buf.subarray(zipStart))
  zip.extractAllTo(outDir, true)
  return outDir
}

function unpackZipFile(zipPath, outDir) {
  ensureDir(outDir)
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(outDir, true)
  return outDir
}

function ensureUnpackedExtension(item) {
  if (!item || !item.path) return null
  if (item.url && !item.path) return null

  const srcPath = item.path
  if (!fs.existsSync(srcPath)) return null

  const stat = fs.statSync(srcPath)
  if (stat.isDirectory()) {
    return fs.existsSync(path.join(srcPath, 'manifest.json')) ? srcPath : null
  }

  const ext = path.extname(srcPath).toLowerCase()
  const unpackedDir = path.join(extensionsRoot, 'unpacked', String(item.id))
  const manifestPath = path.join(unpackedDir, 'manifest.json')
  const markerPath = path.join(unpackedDir, '.source-mtime')
  const sourceMtime = String(stat.mtimeMs)

  let needUnpack = !fs.existsSync(manifestPath)
  if (!needUnpack && fs.existsSync(markerPath)) {
    needUnpack = fs.readFileSync(markerPath, 'utf8') !== sourceMtime
  }

  if (needUnpack) {
    fs.rmSync(unpackedDir, { recursive: true, force: true })
    if (ext === '.crx') {
      unpackCrxFile(srcPath, unpackedDir)
    } else if (ext === '.zip') {
      unpackZipFile(srcPath, unpackedDir)
    } else {
      return null
    }
    fs.writeFileSync(markerPath, sourceMtime, 'utf8')
  }

  return fs.existsSync(manifestPath) ? unpackedDir : null
}

/** 合并环境 payload.crxIds 与 crx-list.environments 绑定 */
function getEnabledExtensionPathsForEnv(envId, envCrxIds) {
  const list = readList()
  const wanted = new Set((envCrxIds || []).map(String))

  for (const item of list) {
    if ((item.environments || []).map(String).includes(String(envId))) {
      wanted.add(String(item.id))
    }
  }

  const paths = []
  for (const crxId of wanted) {
    const item = list.find(it => String(it.id) === String(crxId))
    if (!item || item.enabled === false) continue
    const dir = ensureUnpackedExtension(item)
    if (dir) paths.push(dir)
  }
  return paths
}

/** 环境保存时同步 crx-list 的 environments[] */
function syncEnvCrxBindings(envId, crxIds) {
  const envKey = String(envId)
  const wanted = new Set((crxIds || []).map(String))
  const list = readList()
  let changed = false

  for (const item of list) {
    const envs = new Set((item.environments || []).map(String))
    const shouldHave = wanted.has(String(item.id))
    const has = envs.has(envKey)

    if (shouldHave && !has) {
      envs.add(envKey)
      item.environments = [...envs]
      changed = true
    } else if (!shouldHave && has) {
      envs.delete(envKey)
      item.environments = [...envs]
      changed = true
    }
  }

  if (changed) writeList(list)
  return { ok: true, changed }
}

module.exports = {
  listFile,
  extensionsRoot,
  getCrxList,
  setCrxList,
  addLocalCrx,
  deleteLocalCrx,
  enableLocalCrx,
  updateCrx,
  getCrxEnvironments,
  updateCrxEnvironments,
  ensureUnpackedExtension,
  getEnabledExtensionPathsForEnv,
  syncEnvCrxBindings
}
