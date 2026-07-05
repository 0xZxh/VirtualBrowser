import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.service'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { UserRecord } from './user.types'
import { UsersAdminService } from './users-admin.service'

@Controller('api/users')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private usersAdminService: UsersAdminService) {}

  @Get()
  async list() {
    const data = await this.usersAdminService.listUsers()
    return { code: 0, data }
  }

  @Post()
  async create(
    @Body()
    body: {
      username?: string
      password?: string
      name?: string
      roles?: string[]
      tenantId?: string
    }
  ) {
    const data = await this.usersAdminService.createUser({
      username: body.username || '',
      password: body.password || '',
      name: body.name || '',
      roles: body.roles || ['viewer'],
      tenantId: body.tenantId
    })
    return { code: 0, data }
  }

  @Put(':id/password')
  async resetPassword(@Param('id') id: string, @Body() body: { password?: string }) {
    await this.usersAdminService.resetPassword(id, body.password || '')
    return { code: 0, message: '密码已重置' }
  }

  @Put(':id/environments')
  async assignEnvironments(
    @Param('id') id: string,
    @Body() body: { envIds?: string[] },
    @Req() req: { user: UserRecord }
  ) {
    const data = await this.usersAdminService.assignEnvironments(
      req.user,
      id,
      body.envIds || []
    )
    return { code: 0, data, message: '环境分配已更新' }
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string
      roles?: string[]
      tenantId?: string
      disabled?: boolean
    }
  ) {
    const data = await this.usersAdminService.updateUser(id, body)
    return { code: 0, data }
  }

  @Delete(':id')
  async disable(@Param('id') id: string) {
    const data = await this.usersAdminService.disableUser(id)
    return { code: 0, message: '用户已禁用', data }
  }
}
