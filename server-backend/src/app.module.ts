import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { ProfilesModule } from './profiles/profiles.module'
import { EnvironmentsModule } from './environments/environments.module'
import { StorageModule } from './storage/storage.module'
import { AppController } from './app.controller'
import { BrowserModule } from './browser/browser.module'
import { ApiKeysModule } from './api-keys/api-keys.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule.forRoot(),
    UsersModule,
    AuthModule,
    ProfilesModule,
    EnvironmentsModule,
    ApiKeysModule.forRoot(),
    BrowserModule
  ],
  controllers: [AppController]
})
export class AppModule {}
