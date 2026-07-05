import { Module, forwardRef } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RolesGuard } from '../common/roles.guard'
import { UsersService } from './users.service'
import { UsersAdminService } from './users-admin.service'
import { UsersController } from './users.controller'

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersService, UsersAdminService, RolesGuard],
  exports: [UsersService]
})
export class UsersModule {}
