import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.service'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { UserRecord } from '../users/user.types'
import { deleteGroup, updateGroup } from '../browser/groups.store'
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

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async update(@Param('id') id: string, @Body() body: { name?: string }) {
    const name = String(body?.name || '').trim()
    if (!name) {
      throw new BadRequestException({ code: 400, message: 'name 必填' })
    }
    try {
      const data = updateGroup(Number(id), name)
      return { code: 0, data }
    } catch (err) {
      throw new NotFoundException({
        code: 404,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async remove(@Param('id') id: string) {
    try {
      deleteGroup(Number(id))
      return { code: 0 }
    } catch (err) {
      throw new NotFoundException({
        code: 404,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }
}
