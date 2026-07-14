const fs = require('fs')
const path = require('path')

function hasNativeRuntime(dir) {
  return fs.existsSync(path.join(dir, 'server/lib/native-runtime.js'))
}

/**
 * 解析应用根目录（含 server/lib、dist、config、Chrome-bin）。
 * dev: 仓库根；打包后: VirtualBrowser.exe 所在安装目录。
 */
function resolveAppRoot(fromDir) {
  try {
    const { app } = require('electron')
    if (app.isPackaged) {
      return path.dirname(process.execPath)
    }
  } catch {
    // 非 Electron 进程（如 smoke-test）
  }

  let dir = fromDir
  for (let i = 0; i < 8; i++) {
    if (hasNativeRuntime(dir)) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  return path.join(fromDir, '../..')
}

const appRoot = path.resolve(resolveAppRoot(__dirname))

module.exports = {
  appRoot,
  nativeRuntimePath: path.join(appRoot, 'server/lib/native-runtime.js')
}
