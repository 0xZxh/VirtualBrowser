import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from '../auth/auth.module'
import { EnvironmentsModule } from '../environments/environments.module'
import { StorageModule } from '../storage/storage.module'
import { UsersModule } from '../users/users.module'
import { ApiKeysModule } from '../api-keys/api-keys.module'
import { CompatController } from './compat.controller'
import { BrowserService } from './browser.service'
import { NativeSyncService } from './native-sync.service'
import { CdpProxyService } from './cdp-proxy.service'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule.forRoot(),
    UsersModule,
    AuthModule,
    EnvironmentsModule,
    ApiKeysModule.forRoot()
  ],
  controllers: [CompatController],
  providers: [BrowserService, NativeSyncService, CdpProxyService]
})
export class CompatAppModule {}
