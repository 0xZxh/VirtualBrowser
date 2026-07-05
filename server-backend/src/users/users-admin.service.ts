import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { ENVIRONMENT_REPOSITORY, USER_REPOSITORY } from '../storage/storage.constants'
import { EnvironmentRepository } from '../storage/interfaces/environment.repository'
import { UserRepository } from '../storage/interfaces/user.repository'
import { ALLOWED_ROLES, AdminUserView, toAdminUserView, UserRecord } from './user.types'

@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(USER_REPOSITORY) private userRepository: UserRepository,
    @Inject(ENVIRONMENT_REPOSITORY) private envRepository: EnvironmentRepository
  ) {}

  async listUsers(): Promise<AdminUserView[]> {
    const users = await this.userRepository.findAll()
    return users.map(toAdminUserView)
  }

  async createUser(input: {
    username: string
    password: string
    name: string
    roles: string[]
    tenantId?: string
  }): Promise<AdminUserView> {
    const username = (input.username || '').trim()
    if (!username || !input.password || !input.name) {
      throw new BadRequestException({ code: 400, message: '用户名、密码、姓名不能为空' })
    }

    this.assertRoles(input.roles)

    const exists = await this.userRepository.findByUsername(username)
    if (exists) {
      throw new BadRequestException({ code: 400, message: '用户名已存在' })
    }

    const passwordHash = await bcrypt.hash(input.password, 10)
    const user = await this.userRepository.create({
      username,
      passwordHash,
      name: input.name,
      roles: input.roles,
      tenantId: input.tenantId || '1'
    })
    return toAdminUserView(user)
  }

  async updateUser(
    id: string,
    input: { name?: string; roles?: string[]; tenantId?: string; disabled?: boolean }
  ): Promise<AdminUserView> {
    if (input.roles) {
      this.assertRoles(input.roles)
    }

    const user = await this.userRepository.update(id, input)
    if (!user) {
      throw new NotFoundException({ code: 404, message: '用户不存在' })
    }
    return toAdminUserView(user)
  }

  async resetPassword(id: string, password: string): Promise<void> {
    if (!password || password.length < 6) {
      throw new BadRequestException({ code: 400, message: '密码至少 6 位' })
    }

    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new NotFoundException({ code: 404, message: '用户不存在' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    await this.userRepository.updatePassword(id, passwordHash)
  }

  async disableUser(id: string): Promise<AdminUserView> {
    const user = await this.userRepository.findById(id)
    if (!user) {
      throw new NotFoundException({ code: 404, message: '用户不存在' })
    }

    if (user.username === 'admin' && user.roles.includes('admin')) {
      throw new BadRequestException({ code: 400, message: '不能禁用默认 admin 账号' })
    }

    const updated = await this.userRepository.update(id, { disabled: true })
    return toAdminUserView(updated!)
  }

  /** admin 为用户分配指纹环境（勾选=归属该用户，取消=收回至 admin） */
  async assignEnvironments(
    admin: UserRecord,
    targetUserId: string,
    envIds: string[]
  ): Promise<{ assigned: number; unassigned: number }> {
    const target = await this.userRepository.findById(targetUserId)
    if (!target) {
      throw new NotFoundException({ code: 404, message: '用户不存在' })
    }
    if (target.disabled) {
      throw new BadRequestException({ code: 400, message: '不能为已禁用用户分配环境' })
    }
    if (target.tenantId !== admin.tenantId) {
      throw new BadRequestException({ code: 400, message: '只能分配同租户环境' })
    }

    const all = await this.envRepository.findByTenant(admin.tenantId)
    const wanted = new Set((envIds || []).map(id => String(id)))
    let assigned = 0
    let unassigned = 0

    for (const env of all) {
      const shouldOwn = wanted.has(env.envId)
      const currentlyOwned = env.ownerId === targetUserId

      if (shouldOwn && !currentlyOwned) {
        await this.envRepository.update(env.envId, { ownerId: targetUserId })
        assigned++
      } else if (!shouldOwn && currentlyOwned) {
        await this.envRepository.update(env.envId, { ownerId: admin.id })
        unassigned++
      }
    }

    return { assigned, unassigned }
  }

  private assertRoles(roles: string[]) {
    if (!Array.isArray(roles) || roles.length === 0) {
      throw new BadRequestException({ code: 400, message: '至少指定一个角色' })
    }
    const invalid = roles.filter(r => !ALLOWED_ROLES.includes(r as (typeof ALLOWED_ROLES)[number]))
    if (invalid.length > 0) {
      throw new BadRequestException({ code: 400, message: `无效角色: ${invalid.join(', ')}` })
    }
  }
}
