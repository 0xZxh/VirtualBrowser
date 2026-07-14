import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards
} from '@nestjs/common'
import { Response } from 'express'
import { ApiKeyGuard } from '../api-keys/api-keys.service'
import { UserRecord } from '../users/user.types'
import { BrowserService } from './browser.service'
import { CompatExceptionFilter } from './compat-exception.filter'

@Controller('api')
@UseGuards(ApiKeyGuard)
@UseFilters(CompatExceptionFilter)
export class CompatController {
  constructor(private browserService: BrowserService) {}

  @Get('getBrowserList')
  async getBrowserListGet(@Req() req: { user: UserRecord }) {
    return this.browserService.getBrowserList(req.user)
  }

  @Post('getBrowserList')
  async getBrowserListPost(
    @Req() req: { user: UserRecord },
    @Body() body: { group?: string }
  ) {
    return this.browserService.getBrowserList(req.user, body?.group)
  }

  @Post('addBrowser')
  async addBrowser(@Req() req: { user: UserRecord }, @Body() body: Record<string, unknown>) {
    return this.browserService.addBrowser(req.user, body || {})
  }

  @Post('updateBrowser')
  async updateBrowser(@Req() req: { user: UserRecord }, @Body() body: Record<string, unknown>) {
    return this.browserService.updateBrowser(req.user, body || {})
  }

  @Post('deleteBrowser')
  async deleteBrowser(@Req() req: { user: UserRecord }, @Body() body: Record<string, unknown>) {
    return this.browserService.deleteBrowser(req.user, body || {})
  }

  @Post('launchBrowser')
  async launchBrowser(
    @Req() req: { user: UserRecord; headers: Record<string, string> },
    @Body() body: Record<string, unknown>
  ) {
    return this.browserService.launchBrowser(req.user, body || {}, req)
  }

  @Post('stopBrowser')
  async stopBrowser(@Req() req: { user: UserRecord }, @Body() body: Record<string, unknown>) {
    return this.browserService.stopBrowser(req.user, body || {})
  }

  @Get('getBrowserRunningList')
  async getBrowserRunningList(@Req() req: { user: UserRecord }) {
    return this.browserService.getBrowserRunningList(req.user)
  }

  @Get('getCrxList')
  async getCrxList() {
    return this.browserService.getCrxList()
  }

  @Get('getBrowserFullParameters')
  async getBrowserFullParameters(@Req() req: { user: UserRecord }) {
    return this.browserService.getBrowserFullParameters(req.user)
  }

  /** Apifox：响应为 bare boolean，非 { success } 包装 */
  @Get('isBrowserRunning')
  async isBrowserRunning(
    @Req() req: { user: UserRecord },
    @Query('id') id: string,
    @Res() res: Response
  ) {
    try {
      const running = await this.browserService.isBrowserRunning(req.user, id)
      res.status(200).json(running)
    } catch (err) {
      if (err && typeof err === 'object' && 'getResponse' in err) {
        const httpErr = err as { getStatus: () => number; getResponse: () => unknown }
        const status = httpErr.getStatus()
        const body = httpErr.getResponse()
        res.status(status).json(body)
        return
      }
      res.status(500).json({ success: false, message: '服务器内部错误' })
    }
  }

  @Post('deleteBrowserData')
  async deleteBrowserData(
    @Req() req: { user: UserRecord },
    @Body() body: Record<string, unknown>
  ) {
    return this.browserService.deleteBrowserData(req.user, body || {})
  }

  @Post('clearCache')
  async clearCache(@Req() req: { user: UserRecord }, @Body() body: Record<string, unknown>) {
    return this.browserService.clearCache(req.user, body || {})
  }

  @Get('getGroupList')
  async getGroupList(@Req() req: { user: UserRecord }) {
    return this.browserService.getGroupList(req.user)
  }

  @Post('addGroup')
  async addGroup(@Body() body: Record<string, unknown>) {
    return this.browserService.addGroup(body || {})
  }

  @Post('updateGroup')
  async updateGroup(@Body() body: Record<string, unknown>) {
    return this.browserService.updateGroup(body || {})
  }

  @Post('deleteGroup')
  async deleteGroup(@Body() body: Record<string, unknown>) {
    return this.browserService.deleteGroup(body || {})
  }

  @Post('deleteCrx')
  async deleteCrx(@Body() body: Record<string, unknown>) {
    return this.browserService.deleteCrx(body || {})
  }

  @Post('randomizeFingerprint')
  async randomizeFingerprint(
    @Req() req: { user: UserRecord },
    @Body() body: Record<string, unknown>
  ) {
    return this.browserService.randomizeFingerprint(req.user, body || {})
  }

  @Post('addCrx')
  async addCrx(@Body() body: Record<string, unknown>) {
    return this.browserService.addCrx(body || {})
  }
}
