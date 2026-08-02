/**
 * Lightweight append-only file logger for desktop / native runtime.
 * Writes under %LOCALAPPDATA%/VirtualBrowser/logs (see config/vb-paths).
 * Files are split by local calendar day: native-YYYY-MM-DD.log
 */
const fs = require('fs')
const path = require('path')
const { getLogsDir } = require('../../config/vb-paths')

const MAX_BYTES = 5 * 1024 * 1024
const LOG_BASES = ['native', 'desktop', 'ui', 'backend']
const DATED_LOG_RE = /^(native|desktop|ui|backend)(-\d{4}-\d{2}-\d{2})?\.log$/

function ensureLogsDir() {
  const dir = getLogsDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Local calendar date YYYY-MM-DD */
function localDateStamp(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Resolve log file name. Accepts "native", "native.log", or already-dated names.
 * Undated bases become `${base}-YYYY-MM-DD.log`.
 */
function resolveLogFileName(fileNameOrBase, date = new Date()) {
  const raw = String(fileNameOrBase || '').trim()
  if (!raw) return `native-${localDateStamp(date)}.log`
  if (DATED_LOG_RE.test(raw) && /-\d{4}-\d{2}-\d{2}\.log$/.test(raw)) {
    return raw
  }
  const baseMatch = raw.match(/^(native|desktop|ui|backend)(?:\.log)?$/i)
  if (baseMatch) {
    return `${baseMatch[1].toLowerCase()}-${localDateStamp(date)}.log`
  }
  return raw
}

function maybeRotate(filePath) {
  try {
    const st = fs.statSync(filePath)
    if (st.size <= MAX_BYTES) return
    const keep = fs.readFileSync(filePath, 'utf8').slice(-Math.floor(MAX_BYTES / 2))
    fs.writeFileSync(filePath, keep, 'utf8')
  } catch {
    // ignore
  }
}

function appendLog(fileName, level, message, meta) {
  try {
    const dir = ensureLogsDir()
    const resolved = resolveLogFileName(fileName)
    const filePath = path.join(dir, resolved)
    maybeRotate(filePath)
    const extra =
      meta !== undefined && meta !== null
        ? ` ${typeof meta === 'string' ? meta : JSON.stringify(meta)}`
        : ''
    const line = `[${new Date().toISOString()}] [${level}] ${message}${extra}\n`
    fs.appendFileSync(filePath, line, 'utf8')
  } catch (err) {
    console.warn('[file-logger]', err && err.message ? err.message : err)
  }
}

function logNative(message, meta) {
  console.log('[native]', message, meta !== undefined ? meta : '')
  appendLog('native', 'INFO', String(message), meta)
}

function warnNative(message, meta) {
  console.warn('[native]', message, meta !== undefined ? meta : '')
  appendLog('native', 'WARN', String(message), meta)
}

function errorNative(message, meta) {
  console.error('[native]', message, meta !== undefined ? meta : '')
  appendLog('native', 'ERROR', String(message), meta)
}

function logDesktop(message, meta) {
  console.log('[desktop-shell]', message, meta !== undefined ? meta : '')
  appendLog('desktop', 'INFO', String(message), meta)
}

function errorDesktop(message, meta) {
  console.error('[desktop-shell]', message, meta !== undefined ? meta : '')
  appendLog('desktop', 'ERROR', String(message), meta)
}

/**
 * List log files to include in zip (dated + legacy undated).
 */
function listPackableLogFiles() {
  const dir = ensureLogsDir()
  let names = []
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  return names.filter(name => DATED_LOG_RE.test(name)).sort()
}

/**
 * Pack existing log files under getLogsDir() into a zip.
 * @param {string} [outputPath]
 * @returns {{ ok: boolean, path: string, files: string[] }}
 */
function packLogsZip(outputPath) {
  const AdmZip = require('adm-zip')
  const dir = ensureLogsDir()
  const zip = new AdmZip()
  const files = listPackableLogFiles()
  for (const name of files) {
    const filePath = path.join(dir, name)
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath)
    }
  }
  if (!files.length) {
    zip.addFile('_empty.txt', Buffer.from('no log files yet\n', 'utf8'))
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out = outputPath || path.join(dir, `xianfu-logs-${stamp}.zip`)
  zip.writeZip(out)
  return { ok: true, path: out, files }
}

module.exports = {
  getLogsDir,
  ensureLogsDir,
  localDateStamp,
  resolveLogFileName,
  appendLog,
  logNative,
  warnNative,
  errorNative,
  logDesktop,
  errorDesktop,
  packLogsZip,
  listPackableLogFiles,
  LOG_BASES,
  /** @deprecated use dated files; kept for callers that still list names */
  LOG_ZIP_NAMES: LOG_BASES.map(b => `${b}.log`)
}
