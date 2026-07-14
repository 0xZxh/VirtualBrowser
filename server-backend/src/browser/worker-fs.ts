import * as fs from 'fs'
import * as path from 'path'

const vbRoot = path.join(process.env.LOCALAPPDATA || '', 'VirtualBrowser')
export const workersRoot = path.join(vbRoot, 'Workers')

const CACHE_DIR_NAMES = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'Service Worker',
  'ShaderCache',
  'GrShaderCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache'
]

function rmRecursive(target: string) {
  if (!fs.existsSync(target)) return
  fs.rmSync(target, { recursive: true, force: true })
}

/** 删 Workers/{id} 下除 virtual.dat 外的用户数据 */
export function deleteBrowserDataDir(envId: string): void {
  const workerDir = path.join(workersRoot, String(envId))
  if (!fs.existsSync(workerDir)) return

  for (const entry of fs.readdirSync(workerDir)) {
    if (entry === 'virtual.dat') continue
    rmRecursive(path.join(workerDir, entry))
  }
}

/** 清除 Profile 内常见缓存目录 */
export function clearBrowserCacheDirs(envId: string): void {
  const workerDir = path.join(workersRoot, String(envId))
  if (!fs.existsSync(workerDir)) return

  const candidates = [
    workerDir,
    path.join(workerDir, 'Default'),
    path.join(workerDir, 'Profile 1')
  ]

  for (const base of candidates) {
    if (!fs.existsSync(base)) continue
    for (const name of CACHE_DIR_NAMES) {
      rmRecursive(path.join(base, name))
    }
  }
}
