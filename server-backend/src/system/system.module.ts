import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RolesGuard } from '../common/roles.guard'
import { SystemController } from './system.controller'

@Module({
  imports: [AuthModule],
  controllers: [SystemController],
  providers: [RolesGuard]
})
export class SystemModule {}
