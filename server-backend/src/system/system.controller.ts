import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.service'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { readBackendLogTail } from '../common/file-log.util'

@Controller('api/system')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class SystemController {
  @Get('logs')
  getLogs(@Query('lines') lines?: string) {
    const n = lines != null ? Number(lines) : 300
    const data = readBackendLogTail(Number.isFinite(n) ? n : 300)
    return { code: 0, data }
  }
}
