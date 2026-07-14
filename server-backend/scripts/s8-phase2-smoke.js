/* eslint-disable no-console */
const http = require('http')
const fs = require('fs')
const path = require('path')

const KEY = fs
  .readFileSync(path.join(__dirname, '../data/local/initial-api-key.txt'), 'utf8')
  .trim()

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body != null ? JSON.stringify(body) : null
    const r = http.request(
      {
        hostname: '127.0.0.1',
        port: 9000,
        path: urlPath,
        method,
        headers: {
          'api-key': KEY,
          ...(data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {})
        }
      },
      res => {
        let raw = ''
        res.on('data', c => (raw += c))
        res.on('end', () => {
          resolve({ status: res.statusCode, raw, json: (() => {
            try {
              return JSON.parse(raw)
            } catch {
              return raw
            }
          })() })
        })
      }
    )
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

async function main() {
  const results = []

  const full = await req('GET', '/api/getBrowserFullParameters')
  results.push(['API-09', full.status, Array.isArray(full.json?.data), full.json?.success])

  const running = await req('GET', '/api/isBrowserRunning?id=1')
  results.push(['API-10', running.status, running.raw, typeof running.json === 'boolean'])

  const addG = await req('POST', '/api/addGroup', { name: 's8p2-group' })
  results.push(['API-14', addG.status, addG.json])

  const groups = await req('GET', '/api/getGroupList')
  results.push(['API-13', groups.status, groups.json?.success, (groups.json?.data || []).length])

  const updG = await req('POST', '/api/updateGroup', {
    id: addG.json?.data?.id,
    name: 's8p2-group-renamed'
  })
  results.push(['API-15', updG.status, updG.json])

  const delData = await req('POST', '/api/deleteBrowserData', { id: 1 })
  results.push(['API-11', delData.status, delData.json])

  const clear = await req('POST', '/api/clearCache', { id: 1 })
  results.push(['API-12', clear.status, clear.json])

  const rand = await req('POST', '/api/randomizeFingerprint', { id: 1 })
  results.push(['API-18', rand.status, rand.json])

  const block = await req('POST', '/api/addCrx', {
    storeUrl: 'https://chromewebstore.google.com/detail/x'
  })
  results.push(['API-19-block', block.status, block.json])

  // tiny fake crx base64 then delete
  const addCrx = await req('POST', '/api/addCrx', {
    name: 's8p2-smoke',
    base64: Buffer.from('CRX_SMOKE').toString('base64')
  })
  results.push(['API-19', addCrx.status, !!addCrx.json?.success, addCrx.json?.data?.id])

  const crxId = addCrx.json?.data?.id
  if (crxId != null) {
    const delCrx = await req('POST', '/api/deleteCrx', { id: crxId })
    results.push(['API-17', delCrx.status, delCrx.json])
  }

  const delG = await req('POST', '/api/deleteGroup', { id: addG.json?.data?.id })
  results.push(['API-16', delG.status, delG.json])

  for (const row of results) {
    console.log(JSON.stringify(row))
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
