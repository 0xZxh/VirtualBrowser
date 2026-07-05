import { Inject, Injectable, OnModuleInit } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { USER_REPOSITORY } from '../storage/storage.constants'
import { UserRepository } from '../storage/interfaces/user.repository'
import { UserRecord, PublicUser, toPublicUser } from './user.types'

const SEED_USERS = [
  { username: 'admin', password: 'admin123', name: '管理员', roles: ['admin'] },
  { username: 'operator', password: 'operator123', name: '操作员', roles: ['operator'] },
  { username: 'viewer', password: 'viewer123', name: '访客', roles: ['viewer'] }
]

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@Inject(USER_REPOSITORY) private userRepository: UserRepository) {}

  async onModuleInit() {
    const count = await this.userRepository.count()
    if (count > 0) return

    for (const item of SEED_USERS) {
      const passwordHash = await bcrypt.hash(item.password, 10)
      await this.userRepository.create({
        username: item.username,
        passwordHash,
        name: item.name,
        roles: item.roles,
        tenantId: '1'
      })
    }
    console.log('[users] 已写入种子用户: admin / operator / viewer')
  }

  async validateUser(username: string, password: string): Promise<UserRecord | null> {
    const user = await this.userRepository.findByUsername(username)
    if (!user || user.disabled) return null
    const ok = await bcrypt.compare(password, user.passwordHash)
    return ok ? user : null
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.userRepository.findById(id)
  }

  toPublic(user: UserRecord): PublicUser {
    return toPublicUser(user)
  }
}
