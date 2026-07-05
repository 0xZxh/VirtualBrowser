import {
  Injectable,
  UnauthorizedException,
  CanActivate,
  ExecutionContext,
  Inject
} from '@nestjs/common'
import { randomBytes } from 'crypto'
import { SESSION_REPOSITORY } from '../storage/storage.constants'
import { SessionRepository } from '../storage/interfaces/session.repository'
import { UsersService } from '../users/users.service'
import { UserRecord } from '../users/user.types'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(
    @Inject(SESSION_REPOSITORY) private sessionRepository: SessionRepository,
    private usersService: UsersService
  ) {}

  async login(username: string, password: string) {
    const user = await this.usersService.validateUser(username, password)
    if (!user) {
      throw new UnauthorizedException({ code: 401, message: '用户名或密码错误' })
    }

    const token = randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

    await this.sessionRepository.create(token, user.id, expiresAt)

    return {
      token,
      user: this.usersService.toPublic(user)
    }
  }

  async logout(token: string) {
    await this.sessionRepository.deleteByToken(token)
  }

  async resolveSession(token: string): Promise<{ user: UserRecord; token: string } | null> {
    const session = await this.sessionRepository.findByToken(token)
    if (!session || session.expiresAt.getTime() < Date.now()) {
      if (session) await this.sessionRepository.deleteByToken(token)
      return null
    }

    const user = await this.usersService.findById(session.userId)
    if (!user || user.disabled) return null

    return { user, token }
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const header = req.headers.authorization || ''
    const match = String(header).match(/^Bearer\s+(.+)$/i)
    const token = match ? match[1] : null

    if (!token) {
      throw new UnauthorizedException({ code: 401, message: '未登录' })
    }

    const session = await this.authService.resolveSession(token)
    if (!session) {
      throw new UnauthorizedException({ code: 401, message: '登录已过期' })
    }

    req.user = session.user
    req.token = session.token
    return true
  }
}
