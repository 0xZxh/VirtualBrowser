import { Controller, Get, Query, Req } from '@nestjs/common'
import { IpGeoService, IpGeoResponse } from './ip-geo.service'

@Controller('api/ip-geo')
export class IpGeoController {
  constructor(private readonly ipGeoService: IpGeoService) {}

  /** Public flat JSON for worker/admin normalizeGeo — no auth. */
  @Get()
  async getIpGeo(
    @Req() req: {
      headers?: Record<string, string | string[] | undefined>
      ip?: string
      socket?: { remoteAddress?: string }
      query?: Record<string, string>
    },
    @Query('ip') ipQuery?: string
  ): Promise<IpGeoResponse> {
    const ip =
      (ipQuery && String(ipQuery).trim()) || this.ipGeoService.extractClientIp(req)
    return this.ipGeoService.lookup(ip)
  }
}
