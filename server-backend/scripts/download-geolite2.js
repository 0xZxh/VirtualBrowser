/**
 * Download MaxMind GeoLite2-City.mmdb into DATA_DIR/geoip/
 *
 * Requires a free MaxMind license key (and preferably Account ID for the current API):
 *   https://www.maxmind.com/en/geolite2/signup
 *
 * Env:
 *   MAXMIND_LICENSE_KEY   (required)
 *   MAXMIND_ACCOUNT_ID    (recommended; required by current download API)
 *   DATA_DIR              (default ./data)
 *   GEOIP_MMDB_PATH       (optional explicit destination file path)
 */
const fs = require('fs')
const path = require('path')
const https = require('https')
const http = require('http')
const { execFileSync } = require('child_process')
const os = require('os')

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const text = fs.readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function resolveDestMmdb() {
  const configured = process.env.GEOIP_MMDB_PATH?.trim()
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(path.join(__dirname, '..'), configured)
  }
  const dataDir = process.env.DATA_DIR || './data'
  const base = path.isAbsolute(dataDir)
    ? dataDir
    : path.resolve(path.join(__dirname, '..'), dataDir)
  return path.join(base, 'geoip', 'GeoLite2-City.mmdb')
}

function download(url, destFile, auth) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectsLeft) => {
      const mod = currentUrl.startsWith('https:') ? https : http
      const opts = new URL(currentUrl)
      const headers = {
        'User-Agent': 'virtualbrowser-geoip-update/1.0'
      }
      if (auth) {
        headers.Authorization =
          'Basic ' + Buffer.from(`${auth.user}:${auth.pass}`).toString('base64')
      }
      const req = mod.get(
        {
          protocol: opts.protocol,
          hostname: opts.hostname,
          port: opts.port,
          path: opts.pathname + opts.search,
          headers
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirectsLeft > 0
          ) {
            res.resume()
            // Redirects to R2/presigned URLs must not send Basic auth
            follow(res.headers.location, redirectsLeft - 1)
            return
          }
          if (res.statusCode !== 200) {
            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
              reject(
                new Error(
                  `HTTP ${res.statusCode} downloading ${currentUrl}: ${Buffer.concat(chunks).toString('utf8').slice(0, 300)}`
                )
              )
            })
            return
          }
          const out = fs.createWriteStream(destFile)
          res.pipe(out)
          out.on('finish', () => resolve())
          out.on('error', reject)
        }
      )
      req.on('error', reject)
    }
    follow(url, 10)
  })
}

function extractMmdb(tarGzPath, destMmdb) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'geolite2-'))
  try {
    // Prefer system tar (Windows 10+ has tar.exe); falls back to Node zlib+manual if needed
    try {
      execFileSync('tar', ['-xzf', tarGzPath, '-C', tmpDir], { stdio: 'pipe' })
    } catch (err) {
      throw new Error(
        `Failed to extract tar.gz with system tar: ${(err && err.message) || err}. Install tar or extract manually.`
      )
    }

    const found = findFile(tmpDir, 'GeoLite2-City.mmdb')
    if (!found) {
      throw new Error('GeoLite2-City.mmdb not found inside downloaded archive')
    }
    fs.mkdirSync(path.dirname(destMmdb), { recursive: true })
    fs.copyFileSync(found, destMmdb)
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_) {
      /* ignore */
    }
  }
}

function findFile(dir, name) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isFile() && ent.name === name) return full
    if (ent.isDirectory()) {
      const nested = findFile(full, name)
      if (nested) return nested
    }
  }
  return null
}

async function main() {
  loadDotEnv()

  const licenseKey = (process.env.MAXMIND_LICENSE_KEY || '').trim()
  if (!licenseKey) {
    console.error(
      '[geoip:update] MAXMIND_LICENSE_KEY is required. Sign up at https://www.maxmind.com/en/geolite2/signup and set it in .env'
    )
    process.exit(1)
  }

  const accountId = (process.env.MAXMIND_ACCOUNT_ID || '').trim()
  const destMmdb = resolveDestMmdb()
  const tmpTar = path.join(os.tmpdir(), `GeoLite2-City-${Date.now()}.tar.gz`)

  console.log(`[geoip:update] destination: ${destMmdb}`)

  try {
    if (accountId) {
      const url =
        'https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz'
      console.log(`[geoip:update] downloading via account+license (current MaxMind API)...`)
      await download(url, tmpTar, { user: accountId, pass: licenseKey })
    } else {
      // Legacy query-param endpoint (may still work for some accounts)
      const url = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${encodeURIComponent(licenseKey)}&suffix=tar.gz`
      console.log(
        '[geoip:update] MAXMIND_ACCOUNT_ID not set; trying legacy license_key download URL...'
      )
      console.log(
        '[geoip:update] If this fails, set MAXMIND_ACCOUNT_ID (from MaxMind account portal) and retry.'
      )
      await download(url, tmpTar, null)
    }

    console.log('[geoip:update] extracting GeoLite2-City.mmdb...')
    extractMmdb(tmpTar, destMmdb)
    const stat = fs.statSync(destMmdb)
    console.log(`[geoip:update] OK ${destMmdb} (${stat.size} bytes)`)
  } finally {
    try {
      if (fs.existsSync(tmpTar)) fs.unlinkSync(tmpTar)
    } catch (_) {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('[geoip:update] failed:', err.message || err)
  process.exit(1)
})
