import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard, AuthService } from './auth.service'
import { UsersService } from '../users/users.service'
import { UserRecord } from '../users/user.types'

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService
  ) {}

  @Post('login')
  async login(@Body() body: { username?: string; password?: string }) {
    const data = await this.authService.login(body.username || '', body.password || '')
    return { code: 0, data }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  me(@Req() req: { user: UserRecord }) {
    return { code: 0, data: this.usersService.toPublic(req.user) }
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@Req() req: { token?: string }) {
    if (req.token) await this.authService.logout(req.token)
    return { code: 0, message: '已退出' }
  }
}
