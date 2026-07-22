/**
 * VirtualBrowser 本机数据根路径（跨平台）。
 * - Windows: %LOCALAPPDATA%/VirtualBrowser
 * - macOS:   ~/Library/Application Support/VirtualBrowser
 * - Linux:   $XDG_DATA_HOME/VirtualBrowser 或 ~/.local/share/VirtualBrowser
 *
 * 可用环境变量 VB_DATA_ROOT 覆盖（测试 / 自定义安装布局）。
 *
 * 注意：指纹内核 exe 当前仍仅 Windows 交付（见 MISSION Out of scope）；
 * 本模块供数据目录、Compat/Bridge、云端同机部署统一取路径。
 */
const os = require('os')
const path = require('path')

const APP_DIR_NAME = 'VirtualBrowser'

function getHostPlatform() {
  if (process.platform === 'win32') return 'win32'
  if (process.platform === 'darwin') return 'darwin'
  return 'linux'
}

function getVbRoot() {
  if (process.env.VB_DATA_ROOT) {
    return path.resolve(process.env.VB_DATA_ROOT)
  }

  switch (process.platform) {
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
        APP_DIR_NAME
      )
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', APP_DIR_NAME)
    default:
      return path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'),
        APP_DIR_NAME
      )
  }
}

function getWorkersRoot() {
  return path.join(getVbRoot(), 'Workers')
}

function getUserDataDir() {
  return path.join(getVbRoot(), 'User Data')
}

function getExtensionsRoot() {
  return path.join(getVbRoot(), 'Extensions')
}

function getSnapshotsRoot() {
  return path.join(getVbRoot(), 'ProfileSnapshots')
}

function getBrowserListFile() {
  return path.join(getUserDataDir(), 'browser-list.json')
}

function getGlobalDatFile() {
  return path.join(getUserDataDir(), 'global.dat')
}

function getWorkerDir(envId) {
  return path.join(getWorkersRoot(), String(envId))
}

function getLogsDir() {
  return path.join(getVbRoot(), 'logs')
}

module.exports = {
  APP_DIR_NAME,
  getHostPlatform,
  getVbRoot,
  getWorkersRoot,
  getUserDataDir,
  getExtensionsRoot,
  getSnapshotsRoot,
  getBrowserListFile,
  getGlobalDatFile,
  getWorkerDir,
  getLogsDir
}
