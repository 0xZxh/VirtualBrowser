/**
 * Lightweight append-only file logger for desktop / native runtime.
 * Writes under %LOCALAPPDATA%/VirtualBrowser/logs (see config/vb-paths).
 */
const fs = require('fs')
const path = require('path')
const { getLogsDir } = require('../../config/vb-paths')

const MAX_BYTES = 5 * 1024 * 1024

function ensureLogsDir() {
  const dir = getLogsDir()
  fs.mkdirSync(dir, { recursive: true })
  return dir
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
    const filePath = path.join(dir, fileName)
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
  appendLog('native.log', 'INFO', String(message), meta)
}

function warnNative(message, meta) {
  console.warn('[native]', message, meta !== undefined ? meta : '')
  appendLog('native.log', 'WARN', String(message), meta)
}

function errorNative(message, meta) {
  console.error('[native]', message, meta !== undefined ? meta : '')
  appendLog('native.log', 'ERROR', String(message), meta)
}

function logDesktop(message, meta) {
  console.log('[desktop-shell]', message, meta !== undefined ? meta : '')
  appendLog('desktop.log', 'INFO', String(message), meta)
}

function errorDesktop(message, meta) {
  console.error('[desktop-shell]', message, meta !== undefined ? meta : '')
  appendLog('desktop.log', 'ERROR', String(message), meta)
}

const LOG_ZIP_NAMES = ['native.log', 'desktop.log', 'ui.log', 'backend.log']

/**
 * Pack existing log files under getLogsDir() into a zip.
 * @param {string} [outputPath]
 * @returns {{ ok: boolean, path: string, files: string[] }}
 */
function packLogsZip(outputPath) {
  const AdmZip = require('adm-zip')
  const dir = ensureLogsDir()
  const zip = new AdmZip()
  const files = []
  for (const name of LOG_ZIP_NAMES) {
    const filePath = path.join(dir, name)
    if (fs.existsSync(filePath)) {
      zip.addLocalFile(filePath)
      files.push(name)
    }
  }
  if (!files.length) {
    zip.addFile('_empty.txt', Buffer.from('no log files yet\n', 'utf8'))
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out =
    outputPath || path.join(dir, `xianfu-logs-${stamp}.zip`)
  zip.writeZip(out)
  return { ok: true, path: out, files }
}

module.exports = {
  getLogsDir,
  ensureLogsDir,
  appendLog,
  logNative,
  warnNative,
  errorNative,
  logDesktop,
  errorDesktop,
  packLogsZip,
  LOG_ZIP_NAMES
}
