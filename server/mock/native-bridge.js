const cloudSync = require('../lib/cloud-sync')
const nativeRuntime = require('../lib/native-runtime')

module.exports = function registerNativeBridge(app) {
  app.post('/dev-native-bridge', async (req, res) => {
    try {
      const { name, params } = req.body || {}
      if (!name) {
        res.status(400).send('missing name')
        return
      }
      const result = await nativeRuntime.handleNativeCall(name, params, req)
      res.json(result)
    } catch (err) {
      console.error('[dev-native-bridge]', err)
      res.status(500).send(err.message || String(err))
    }
  })

  console.log('')
  console.log('  [dev-native-bridge] localhost 二开模式已启用')
  console.log('  UI: npm run dev  →  http://localhost:9527')
  console.log('  native 走 Node 桥接，launchBrowser 调用真实内核')
  console.log(`  内核: ${nativeRuntime.innerExe}`)
  console.log(`  云同步: ${cloudSync.getCloudApiBase()}（登录 Bearer 自动；CLOUD_API_TOKEN 可选兜底）`)
  console.log('')
}
