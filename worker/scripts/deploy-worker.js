const fs = require('fs')
const path = require('path')

/**
 * Cross-platform worker deploy (replaces PowerShell-only deploy-worker.ps1 as primary).
 * Build worker/dist/worker → copy into Chrome-bin/.../worker
 */
const repoRoot = path.join(__dirname, '../..')
const pathsFile = path.join(repoRoot, 'config/chrome-bin.paths.json')
const paths = JSON.parse(fs.readFileSync(pathsFile, 'utf8'))
const buildOut = path.join(repoRoot, 'worker', 'dist', 'worker')
const target = path.join(repoRoot, paths.innerWorkerDir.replace(/\//g, path.sep))

function rmContents(dir) {
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    if (name === '.bak' || name.endsWith('.bak')) continue
    fs.rmSync(path.join(dir, name), { recursive: true, force: true })
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

if (!fs.existsSync(target)) {
  console.error('Worker target missing:', target)
  process.exit(1)
}

console.log('>>> npm run build (worker)')
const { spawnSync } = require('child_process')
const build = spawnSync('npm', ['run', 'build'], {
  cwd: path.join(repoRoot, 'worker'),
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
if (build.status !== 0) {
  process.exit(build.status || 1)
}

if (!fs.existsSync(path.join(buildOut, 'index.html'))) {
  console.error('Build output missing:', buildOut)
  process.exit(1)
}

const bak = target + '.bak'
if (!fs.existsSync(bak)) {
  copyDir(target, bak)
  console.log('Backup:', bak)
}

console.log('>>> deploy to', target)
rmContents(target)
copyDir(buildOut, target)
console.log('Done. Restart a fingerprint browser window to see changes.')
