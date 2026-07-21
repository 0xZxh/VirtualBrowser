import { Module } from '@nestjs/common'
import { IpGeoController } from './ip-geo.controller'
import { IpGeoService } from './ip-geo.service'

@Module({
  controllers: [IpGeoController],
  providers: [IpGeoService],
  exports: [IpGeoService]
})
export class IpGeoModule {}
