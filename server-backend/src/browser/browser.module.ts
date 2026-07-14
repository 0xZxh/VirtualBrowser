import { Module } from '@nestjs/common'
import { EnvironmentsModule } from '../environments/environments.module'
import { CompatListenerService } from './compat-listener.service'

@Module({
  imports: [EnvironmentsModule],
  providers: [CompatListenerService]
})
export class BrowserModule {}
