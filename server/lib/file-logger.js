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

module.exports = {
  getLogsDir,
  ensureLogsDir,
  appendLog,
  logNative,
  warnNative,
  errorNative,
  logDesktop,
  errorDesktop
}
