import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { HttpExceptionFilter } from './common/http-exception.filter'
import { teeConsoleToFile } from './common/file-log.util'
import { getLocalStorageKind, getStorageDriver } from './storage/storage.config'
import * as express from 'express'
import { join } from 'path'
import * as fs from 'fs'

/** 生产 CORS：CORS_ORIGINS 逗号分隔；未设或 `*` 则允许任意来源（与 dev 一致） */
function getCorsOptions(): { origin: boolean | string[]; credentials: boolean } {
  const raw = process.env.CORS_ORIGINS?.trim()
  if (!raw || raw === '*') {
    return { origin: true, credentials: true }
  }
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return { origin: origins.length > 0 ? origins : true, credentials: true }
}

function resolvePublicDir(): string {
  const candidates = [
    join(__dirname, '..', 'public'),
    join(__dirname, 'public'),
    join(process.cwd(), 'public')
  ]
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir
  }
  return candidates[0]
}

async function bootstrap() {
  teeConsoleToFile('backend.log')

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
  const corsOptions = getCorsOptions()
  app.enableCors(corsOptions)
  app.useGlobalFilters(new HttpExceptionFilter())

  const publicDir = resolvePublicDir()
  app.useStaticAssets(publicDir)
  console.log(`[server-backend] static public=`, publicDir)

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
      // 批量导入环境（含 cookie/指纹）远超默认 100kb；可用 BODY_JSON_LIMIT 覆盖
      const jsonLimit = process.env.BODY_JSON_LIMIT?.trim() || '32mb'
      express.json({ limit: jsonLimit })(req, res, next)
    }
  })

  const port = process.env.PORT || 3001
  const storage = getStorageDriver()
  await app.listen(port)
  console.log(`[server-backend] NestJS http://localhost:${port}`)
  console.log(`[server-backend] H5 http://localhost:${port}/h5/`)
  console.log(`[server-backend] STORAGE_DRIVER=${storage}`)
  if (storage === 'local') {
    console.log(`[server-backend] LOCAL_STORAGE=${getLocalStorageKind()}`)
  } else {
    console.log(`[server-backend] MONGODB_URI=${process.env.MONGODB_URI || 'default'}`)
  }
  const corsLabel =
    corsOptions.origin === true
      ? '*'
      : Array.isArray(corsOptions.origin)
        ? corsOptions.origin.join(', ')
        : String(corsOptions.origin)
  console.log(`[server-backend] CORS_ORIGINS=${corsLabel}`)
  console.log('[server-backend] 种子用户: admin/admin123, operator/operator123, viewer/viewer123')
}

bootstrap()
