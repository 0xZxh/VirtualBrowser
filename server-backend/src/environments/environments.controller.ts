import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common'
import { AuthGuard } from '../auth/auth.service'
import { Roles } from '../common/roles.decorator'
import { RolesGuard } from '../common/roles.guard'
import { UserRecord } from '../users/user.types'
import { BrowserEnvironmentItem } from './environment.types'
import { EnvironmentsService } from './environments.service'

@Controller('api/environments')
@UseGuards(AuthGuard)
export class EnvironmentsController {
  constructor(private environmentsService: EnvironmentsService) {}

  @Get()
  async list(
    @Req() req: { user: UserRecord },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('group') group?: string,
    @Query('q') q?: string
  ) {
    // Always return paginated shape for list UI; defaults page=1 limit=20
    const data = await this.environmentsService.listPage(req.user, {
      page: page != null && page !== '' ? Number(page) : 1,
      limit: limit != null && limit !== '' ? Number(limit) : 20,
      group,
      q
    })
    return { code: 0, data }
  }

  @Get(':envId')
  async getOne(@Param('envId') envId: string, @Req() req: { user: UserRecord }) {
    const data = await this.environmentsService.getOne(req.user, envId)
    return { code: 0, data }
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async create(@Req() req: { user: UserRecord }, @Body() body: BrowserEnvironmentItem) {
    const data = await this.environmentsService.create(req.user, body || {})
    return { code: 0, data }
  }

  @Post('batch')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async createBatch(
    @Req() req: { user: UserRecord },
    @Body() body: { items?: BrowserEnvironmentItem[] }
  ) {
    const data = await this.environmentsService.createBatch(req.user, body?.items || [])
    return { code: 0, data }
  }

  @Post('batch-group')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async updateGroupBatch(
    @Req() req: { user: UserRecord },
    @Body() body: { ids?: Array<string | number>; group?: string }
  ) {
    const data = await this.environmentsService.updateGroupBatch(
      req.user,
      body?.ids || [],
      body?.group || ''
    )
    return { code: 0, data }
  }

  @Delete('batch')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async removeBatch(
    @Req() req: { user: UserRecord },
    @Body() body: { ids?: Array<string | number> }
  ) {
    const data = await this.environmentsService.removeBatch(req.user, body?.ids || [])
    return { code: 0, data }
  }

  @Put(':envId')
  @UseGuards(RolesGuard)
  @Roles('admin', 'operator')
  async update(
    @Param('envId') envId: string,
    @Req() req: { user: UserRecord },
    @Body() body: BrowserEnvironmentItem
  ) {
    const data = await this.environmentsService.update(req.user, envId, body || {})
    return { code: 0, data }
  }

  @Delete(':envId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async remove(@Param('envId') envId: string, @Req() req: { user: UserRecord }) {
    await this.environmentsService.remove(req.user, envId)
    return { code: 0, message: '环境已删除' }
  }

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('admin')
  async importLegacy(
    @Req() req: { user: UserRecord },
    @Body() body: { items?: BrowserEnvironmentItem[] }
  ) {
    const data = await this.environmentsService.importLegacy(req.user, body?.items || [])
    return { code: 0, data }
  }
}
