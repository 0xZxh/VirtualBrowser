import { DynamicModule, Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { User, UserSchema } from '../users/user.schema'
import { Session, SessionSchema } from '../auth/session.schema'
import { USER_REPOSITORY, SESSION_REPOSITORY, ENVIRONMENT_REPOSITORY } from './storage.constants'
import {
  getLocalStorageKind,
  getMongoUri,
  getStorageDriver
} from './storage.config'
import { SqliteDatabaseService } from './drivers/sqlite/sqlite-database.service'
import { SqliteUserRepository } from './drivers/sqlite/sqlite-user.repository'
import { SqliteSessionRepository } from './drivers/sqlite/sqlite-session.repository'
import { JsonStoreService } from './drivers/json/json-store.service'
import { JsonUserRepository } from './drivers/json/json-user.repository'
import { JsonSessionRepository } from './drivers/json/json-session.repository'
import { MongoUserRepository } from './drivers/mongo/mongo-user.repository'
import { MongoSessionRepository } from './drivers/mongo/mongo-session.repository'
import { MongoEnvironmentRepository } from './drivers/mongo/mongo-environment.repository'
import { Environment, EnvironmentSchema } from '../environments/environment.schema'
import { SqliteEnvironmentRepository } from './drivers/sqlite/sqlite-environment.repository'
import { JsonEnvironmentRepository } from './drivers/json/json-environment.repository'

@Module({})
export class StorageModule {
  static forRoot(): DynamicModule {
    const driver = getStorageDriver()

    if (driver === 'mongo') {
      return {
        module: StorageModule,
        global: true,
        imports: [
          MongooseModule.forRoot(getMongoUri()),
          MongooseModule.forFeature([
            { name: User.name, schema: UserSchema },
            { name: Session.name, schema: SessionSchema },
            { name: Environment.name, schema: EnvironmentSchema }
          ])
        ],
        providers: [
          { provide: USER_REPOSITORY, useClass: MongoUserRepository },
          { provide: SESSION_REPOSITORY, useClass: MongoSessionRepository },
          { provide: ENVIRONMENT_REPOSITORY, useClass: MongoEnvironmentRepository }
        ],
        exports: [USER_REPOSITORY, SESSION_REPOSITORY, ENVIRONMENT_REPOSITORY, MongooseModule]
      }
    }

    const localKind = getLocalStorageKind()
    if (localKind === 'json') {
      return {
        module: StorageModule,
        global: true,
        providers: [
          JsonStoreService,
          { provide: USER_REPOSITORY, useClass: JsonUserRepository },
          { provide: SESSION_REPOSITORY, useClass: JsonSessionRepository },
          { provide: ENVIRONMENT_REPOSITORY, useClass: JsonEnvironmentRepository }
        ],
        exports: [USER_REPOSITORY, SESSION_REPOSITORY, ENVIRONMENT_REPOSITORY]
      }
    }

    return {
      module: StorageModule,
      global: true,
      providers: [
        SqliteDatabaseService,
        { provide: USER_REPOSITORY, useClass: SqliteUserRepository },
        { provide: SESSION_REPOSITORY, useClass: SqliteSessionRepository },
        { provide: ENVIRONMENT_REPOSITORY, useClass: SqliteEnvironmentRepository }
      ],
      exports: [USER_REPOSITORY, SESSION_REPOSITORY, ENVIRONMENT_REPOSITORY]
    }
  }
}
