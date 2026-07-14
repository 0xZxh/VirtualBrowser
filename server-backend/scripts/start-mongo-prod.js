/**
 * S6 生产验收：本机拉起 MongoDB（无 Docker/系统安装时）
 * 使用 mongodb-memory-server 下载并启动真实 mongod 进程，数据落盘到 .mongo-data/db
 */
const fs = require('fs')
const path = require('path')
const { MongoMemoryServer } = require('mongodb-memory-server')

const DB_PATH = path.join(__dirname, '..', '.mongo-data', 'db')
fs.mkdirSync(DB_PATH, { recursive: true })

async function main() {
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'virtualbrowser',
      dbPath: DB_PATH,
      storageEngine: 'wiredTiger'
    }
  })
  const uri = mongod.getUri()
  console.log(`[mongo-prod] started`)
  console.log(`[mongo-prod] uri=${uri}`)
  console.log(`[mongo-prod] dbPath=${DB_PATH}`)
  console.log(`[mongo-prod] pid=${process.pid}`)

  const shutdown = async () => {
    await mongod.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[mongo-prod] failed:', err)
  process.exit(1)
})
