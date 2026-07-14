import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { CompatExceptionFilter } from './compat-exception.filter'
import { CompatAppModule } from './compat-app.module'

@Injectable()
export class CompatListenerService implements OnApplicationBootstrap {
  async onApplicationBootstrap() {
    const port = Number(process.env.COMPAT_API_PORT || 9000)
    const compatApp = await NestFactory.create(CompatAppModule, { bodyParser: true })
    compatApp.useGlobalFilters(new CompatExceptionFilter())
    await compatApp.listen(port)
    console.log(`[server-backend] Compat API http://127.0.0.1:${port}`)
  }
}
