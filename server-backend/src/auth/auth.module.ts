import { Module, forwardRef } from '@nestjs/common'
import { AuthService, AuthGuard } from './auth.service'
import { AuthController } from './auth.controller'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [forwardRef(() => UsersModule)],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard]
})
export class AuthModule {}
