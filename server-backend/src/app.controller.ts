import { Controller, Get, Optional } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'
import { getLocalStorageKind, getStorageDriver } from './storage/storage.config'

@Controller()
export class AppController {
  constructor(@Optional() @InjectConnection() private readonly connection?: Connection) {}

  @Get('health')
  health() {
    const storage = getStorageDriver()
    const localKind = storage === 'local' ? getLocalStorageKind() : undefined
    const mongoReady = this.connection?.readyState === 1

    return {
      ok: storage === 'local' ? true : mongoReady === true,
      service: 'virtualbrowser-backend',
      stack: 'nestjs',
      storage,
      localKind,
      mongo: storage === 'mongo' ? (mongoReady ? 'connected' : 'disconnected') : 'n/a'
    }
  }
}
