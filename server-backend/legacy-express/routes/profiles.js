const express = require('express')
const { authMiddleware } = require('../middleware/auth')
const snapshotStore = require('../lib/profile-snapshot-store')

const router = express.Router()

router.get('/:envId/snapshot/meta', authMiddleware, (req, res) => {
  const { envId } = req.params
  const meta = snapshotStore.getSnapshotMeta(envId)
  if (!meta) {
    res.status(404).json({ code: 404, message: '云端无快照', envId })
    return
  }
  res.json({ code: 0, data: meta })
})

router.get('/:envId/snapshot', authMiddleware, (req, res) => {
  const { envId } = req.params
  const meta = snapshotStore.getSnapshotMeta(envId)
  if (!meta) {
    res.status(404).json({ code: 404, message: '云端无快照', envId })
    return
  }

  const stream = snapshotStore.openSnapshotStream(envId)
  if (!stream) {
    res.status(404).json({ code: 404, message: '快照文件缺失', envId })
    return
  }

  res.setHeader('Content-Type', 'application/zip')
  res.setHeader('Content-Disposition', `attachment; filename="profile-${envId}.zip"`)
  res.setHeader('Content-Length', String(meta.size))
  res.setHeader('X-Profile-Version', String(meta.version))
  res.setHeader('X-Profile-Updated-At', meta.updatedAt)
  stream.pipe(res)
})

router.post(
  '/:envId/snapshot',
  authMiddleware,
  express.raw({
    type: ['application/zip', 'application/octet-stream', 'application/x-zip-compressed'],
    limit: '512mb'
  }),
  (req, res) => {
    const { envId } = req.params
    const body = req.body

    if (!Buffer.isBuffer(body) || body.length === 0) {
      res.status(400).json({
        code: 400,
        message: '请使用 raw body 上传 zip（Content-Type: application/zip）'
      })
      return
    }

    const zipMagic = body[0] === 0x50 && body[1] === 0x4b
    if (!zipMagic) {
      res.status(400).json({ code: 400, message: '上传内容不是有效的 zip 文件' })
      return
    }

    const meta = snapshotStore.saveSnapshot(envId, body)
    res.json({
      code: 0,
      message: '快照已保存',
      data: meta
    })
  }
)

module.exports = router
