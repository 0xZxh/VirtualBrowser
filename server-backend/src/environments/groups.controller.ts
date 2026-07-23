import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../auth/auth.service'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { UserRecord } from '../users/user.types'
import { EnvironmentsService } from './environments.service'

@Controller('api/groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private environmentsService: EnvironmentsService) {}

  @Get()
  async list(@Req() req: { user: UserRecord }) {
    const data = await this.environmentsService.listGroupsForUser(req.user)
    return { code: 0, data }
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async create(@Body() body: { name?: string }) {
    const data = this.environmentsService.ensureGroup(body?.name)
    return { code: 0, data }
  }
}
