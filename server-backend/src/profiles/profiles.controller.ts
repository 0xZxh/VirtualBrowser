import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException
} from '@nestjs/common'
import { Response } from 'express'
import { AuthGuard } from '../auth/auth.service'
import { UserRecord } from '../users/user.types'
import { EnvironmentsService } from '../environments/environments.service'
import { ProfileSnapshotService } from './profile-snapshot.service'

@Controller('api/profiles')
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(
    private snapshotService: ProfileSnapshotService,
    private environmentsService: EnvironmentsService
  ) {}

  @Get(':envId/snapshot/meta')
  async getMeta(@Param('envId') envId: string, @Req() req: { user: UserRecord }) {
    await this.environmentsService.assertCanAccess(req.user, envId)
    const meta = this.snapshotService.getSnapshotMeta(req.user.tenantId, envId)
    if (!meta) {
      throw new NotFoundException({ code: 404, message: '云端无快照', envId })
    }
    return { code: 0, data: meta }
  }

  @Get(':envId/snapshot')
  async download(@Param('envId') envId: string, @Req() req: { user: UserRecord }, @Res() res: Response) {
    await this.environmentsService.assertCanAccess(req.user, envId)
    const meta = this.snapshotService.getSnapshotMeta(req.user.tenantId, envId)
    if (!meta) {
      res.status(404).json({ code: 404, message: '云端无快照', envId })
      return
    }

    const stream = this.snapshotService.openSnapshotStream(req.user.tenantId, envId)
    if (!stream) {
      res.status(404).json({ code: 404, message: '快照文件缺失', envId })
      return
    }

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="profile-${envId}.zip"`)
    res.setHeader('Content-Length', String(meta.size))
    res.setHeader('X-Profile-Version', String(meta.version))
    res.setHeader('X-Profile-Updated-At', meta.updatedAt)
    stream.pipe(res)
  }

  @Post(':envId/snapshot')
  async upload(
    @Param('envId') envId: string,
    @Req() req: { user: UserRecord; body: Buffer | unknown }
  ) {
    await this.environmentsService.assertCanAccess(req.user, envId)
    const body = req.body

    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException({
        code: 400,
        message: '请使用 raw body 上传 zip（Content-Type: application/zip）'
      })
    }

    const zipMagic = body[0] === 0x50 && body[1] === 0x4b
    if (!zipMagic) {
      throw new BadRequestException({ code: 400, message: '上传内容不是有效的 zip 文件' })
    }

    const meta = this.snapshotService.saveSnapshot(req.user.tenantId, envId, body)
    return {
      code: 0,
      message: '快照已保存',
      data: meta
    }
  }
}
