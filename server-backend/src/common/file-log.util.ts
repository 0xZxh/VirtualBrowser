/**
 * Bridge to shared file-logger for Nest server-backend.
 * Paths resolve from server-backend/{src,dist}/common → repo root.
 */
import * as fs from 'fs'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fileLogger = require(path.join(__dirname, '../../../server/lib/file-logger.js')) as {
  getLogsDir: () => string
  ensureLogsDir: () => string
  appendLog: (fileName: string, level: string, message: string, meta?: unknown) => void
}

const BACKEND_LOG = 'backend.log'

let teeInstalled = false
let teeing = false

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) {
    return value.stack || value.message || String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function getBackendLogPath(): string {
  return path.join(fileLogger.getLogsDir(), BACKEND_LOG)
}

export function appendBackendLog(level: string, message: string, meta?: unknown): void {
  fileLogger.appendLog(BACKEND_LOG, level, message, meta)
}

/**
 * Tee console.log/warn/error/info into backend.log (stdout preserved).
 * Call once at process start before Nest bootstrap.
 */
export function teeConsoleToFile(fileName: string = BACKEND_LOG): void {
  if (teeInstalled) return
  teeInstalled = true

  fileLogger.ensureLogsDir()

  const orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  }

  const wrap =
    (level: string, origFn: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      origFn(...args)
      if (teeing) return
      teeing = true
      try {
        const message = args.map(safeStringify).join(' ')
        fileLogger.appendLog(fileName, level, message)
      } catch {
        // never throw from logger
      } finally {
        teeing = false
      }
    }

  console.log = wrap('INFO', orig.log) as typeof console.log
  console.info = wrap('INFO', orig.info) as typeof console.info
  console.warn = wrap('WARN', orig.warn) as typeof console.warn
  console.error = wrap('ERROR', orig.error) as typeof console.error
}

/**
 * Read the last N lines of backend.log.
 */
export function readBackendLogTail(lines = 200): { path: string; content: string; exists: boolean } {
  const maxLines = Math.min(Math.max(Number(lines) || 200, 1), 2000)
  const logPath = getBackendLogPath()
  if (!fs.existsSync(logPath)) {
    return { path: logPath, content: '', exists: false }
  }
  try {
    const raw = fs.readFileSync(logPath, 'utf8')
    const all = raw.split(/\r?\n/)
    // drop trailing empty line from final \n
    if (all.length && all[all.length - 1] === '') {
      all.pop()
    }
    const slice = all.slice(-maxLines)
    return { path: logPath, content: slice.join('\n'), exists: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { path: logPath, content: `[read failed] ${msg}`, exists: true }
  }
}
