import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { EnvironmentsModule } from '../environments/environments.module'
import { ProfileSnapshotService } from './profile-snapshot.service'
import { ProfilesController } from './profiles.controller'

@Module({
  imports: [AuthModule, EnvironmentsModule],
  controllers: [ProfilesController],
  providers: [ProfileSnapshotService]
})
export class ProfilesModule {}
