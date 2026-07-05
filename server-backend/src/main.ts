import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/http-exception.filter'
import { getLocalStorageKind, getStorageDriver } from './storage/storage.config'
import * as express from 'express'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false })
  app.enableCors()
  app.useGlobalFilters(new HttpExceptionFilter())

  app.use((req, res, next) => {
    const contentType = String(req.headers['content-type'] || '')
    const isSnapshotUpload =
      req.method === 'POST' &&
      /\/api\/profiles\/[^/]+\/snapshot$/.test(req.url) &&
      (contentType.includes('application/zip') ||
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/x-zip-compressed'))

    if (isSnapshotUpload) {
      express.raw({ type: '*/*', limit: '512mb' })(req, res, next)
    } else {
      express.json({ limit: '2mb' })(req, res, next)
    }
  })

  const port = process.env.PORT || 3001
  const storage = getStorageDriver()
  await app.listen(port)
  console.log(`[server-backend] NestJS http://localhost:${port}`)
  console.log(`[server-backend] STORAGE_DRIVER=${storage}`)
  if (storage === 'local') {
    console.log(`[server-backend] LOCAL_STORAGE=${getLocalStorageKind()}`)
  } else {
    console.log(`[server-backend] MONGODB_URI=${process.env.MONGODB_URI || 'default'}`)
  }
  console.log('[server-backend] 种子用户: admin/admin123, operator/operator123, viewer/viewer123')
}

bootstrap()
