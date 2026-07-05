import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { RolesGuard } from '../common/roles.guard'
import { EnvironmentsController } from './environments.controller'
import { EnvironmentsService } from './environments.service'

@Module({
  imports: [AuthModule],
  controllers: [EnvironmentsController],
  providers: [EnvironmentsService, RolesGuard],
  exports: [EnvironmentsService]
})
export class EnvironmentsModule {}
