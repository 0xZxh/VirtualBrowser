/**
 * Generate FP brand packaging/assets/app.ico (16/32/48/256) + VisualElements PNGs.
 * Usage: node packaging/scripts/generate-app-icon.js
 * Requires: sharp, to-ico (installed under desktop-shell or via npx).
 */
'use strict'

const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../..')
const assetsDir = path.join(repoRoot, 'packaging', 'assets')
const svgCandidates = [
  path.join(repoRoot, 'worker', 'src', 'assets', 'logo.svg'),
  path.join(repoRoot, 'server', 'public', 'favicon.svg')
]

function resolveModule(name) {
  const roots = [
    path.join(repoRoot, 'desktop-shell', 'node_modules'),
    path.join(repoRoot, 'packaging', 'node_modules'),
    path.join(repoRoot, 'node_modules')
  ]
  for (const root of roots) {
    const candidate = path.join(root, name)
    try {
      return require(candidate)
    } catch (_) {
      /* try next */
    }
  }
  return require(name)
}

async function main() {
  const sharp = resolveModule('sharp')
  const toIco = resolveModule('to-ico')

  const svgPath = svgCandidates.find((p) => fs.existsSync(p))
  if (!svgPath) {
    throw new Error('No FP SVG found (worker logo / server favicon)')
  }

  fs.mkdirSync(assetsDir, { recursive: true })
  const svg = fs.readFileSync(svgPath)

  const icoSizes = [16, 32, 48, 256]
  const pngBuffers = []
  for (const size of icoSizes) {
    const buf = await sharp(svg).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    pngBuffers.push(buf)
  }

  const ico = await toIco(pngBuffers)
  const icoPath = path.join(assetsDir, 'app.ico')
  fs.writeFileSync(icoPath, ico)

  const logoPng = await sharp(svg).resize(600, 600).png().toBuffer()
  const smallPng = await sharp(svg).resize(176, 176).png().toBuffer()
  fs.writeFileSync(path.join(assetsDir, 'Logo.png'), logoPng)
  fs.writeFileSync(path.join(assetsDir, 'SmallLogo.png'), smallPng)

  // Desktop-shell copy for BrowserWindow in dev / staging resources/app
  const shellAssets = path.join(repoRoot, 'desktop-shell', 'assets')
  fs.mkdirSync(shellAssets, { recursive: true })
  fs.copyFileSync(icoPath, path.join(shellAssets, 'app.ico'))

  console.log('Generated:')
  console.log(' ', icoPath, `(${ico.length} bytes)`)
  console.log(' ', path.join(assetsDir, 'Logo.png'))
  console.log(' ', path.join(assetsDir, 'SmallLogo.png'))
  console.log(' ', path.join(shellAssets, 'app.ico'))
  console.log('Source SVG:', svgPath)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
