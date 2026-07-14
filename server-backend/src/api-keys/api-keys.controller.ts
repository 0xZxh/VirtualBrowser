import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.service'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { UserRecord } from '../users/user.types'
import { ApiKeysService } from './api-keys.service'

@Controller('api/api-keys')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class ApiKeysController {
  constructor(private apiKeysService: ApiKeysService) {}

  @Get()
  async list() {
    const data = await this.apiKeysService.listKeys()
    return { code: 0, data }
  }

  @Post()
  async create(@Req() req: { user: UserRecord }, @Body() body: { label?: string }) {
    const data = await this.apiKeysService.createKey(req.user, body?.label || '')
    return { code: 0, data }
  }

  @Delete(':id')
  async revoke(@Param('id') id: string) {
    await this.apiKeysService.revokeKey(id)
    return { code: 0, message: 'api-key 已吊销' }
  }
}
