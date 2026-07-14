import { DynamicModule, Global, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { UsersModule } from '../users/users.module'
import { RolesGuard } from '../common/roles.guard'
import { ApiKeysController } from './api-keys.controller'
import { ApiKeyGuard, ApiKeysService, createApiKeyRepositoryProvider } from './api-keys.service'
import { SqliteApiKeyRepository } from './sqlite-api-key.repository'
import { JsonApiKeyRepository } from './json-api-key.repository'

@Global()
@Module({})
export class ApiKeysModule {
  static forRoot(): DynamicModule {
    return {
      module: ApiKeysModule,
      global: true,
      imports: [UsersModule, AuthModule],
      controllers: [ApiKeysController],
      providers: [
        createApiKeyRepositoryProvider(),
        ApiKeysService,
        ApiKeyGuard,
        RolesGuard,
        SqliteApiKeyRepository,
        JsonApiKeyRepository
      ],
      exports: [ApiKeysService, ApiKeyGuard]
    }
  }
}
