import {
  Injectable,
  Inject,
  OnModuleInit,
  UnauthorizedException,
  NotFoundException,
  CanActivate,
  ExecutionContext
} from '@nestjs/common'
import { createHash, randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { UsersService } from '../users/users.service'
import { UserRecord } from '../users/user.types'
import { getLocalJsonDir, getLocalStorageKind, getStorageDriver } from '../storage/storage.config'
import { API_KEY_REPOSITORY, ApiKeyRepository } from './api-key.repository'
import { ApiKeyPublicView, CreatedApiKeyView } from './api-key.types'
import { JsonApiKeyRepository } from './json-api-key.repository'
import { SqliteApiKeyRepository } from './sqlite-api-key.repository'

function hashKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

function generatePlainKey(): string {
  return `vb_${randomBytes(24).toString('hex')}`
}

function seedKeyFilePath(): string {
  return path.join(getLocalJsonDir(), 'initial-api-key.txt')
}

@Injectable()
export class ApiKeysService implements OnModuleInit {
  constructor(
    @Inject(API_KEY_REPOSITORY) private repo: ApiKeyRepository,
    private usersService: UsersService
  ) {}

  async onModuleInit() {
    await this.repo.ensureSchema()
    const count = await this.repo.count()
    if (count > 0) return

    const operator = await this.findSeedUser()
    if (!operator) {
      console.warn('[api-keys] 未找到 operator 用户，跳过种子 key 生成')
      return
    }

    const created = await this.createKey(operator, 'compat-seed')
    const seedPath = seedKeyFilePath()
    fs.mkdirSync(path.dirname(seedPath), { recursive: true })
    fs.writeFileSync(seedPath, created.key, 'utf8')
    console.log(`[api-keys] 种子 api-key 已写入 ${seedPath}`)
    console.log(`[api-keys] 种子 api-key（仅首次）: ${created.key}`)
  }

  readSeedKeyFromFile(): string | null {
    const seedPath = seedKeyFilePath()
    try {
      const raw = fs.readFileSync(seedPath, 'utf8').trim()
      return raw || null
    } catch {
      return null
    }
  }

  private async findSeedUser(): Promise<UserRecord | null> {
    const operator = await this.usersService.validateUser('operator', 'operator123')
    if (operator) return operator
    const admin = await this.usersService.validateUser('admin', 'admin123')
    return admin
  }

  async validateKey(plainKey: string): Promise<UserRecord | null> {
    const trimmed = String(plainKey || '').trim()
    if (!trimmed) return null
    const record = await this.repo.findByHash(hashKey(trimmed))
    if (!record) return null
    return this.usersService.findById(record.userId)
  }

  async createKey(owner: UserRecord, label = ''): Promise<CreatedApiKeyView> {
    const plain = generatePlainKey()
    const now = new Date().toISOString()
    const record = await this.repo.create({
      id: randomBytes(8).toString('hex'),
      keyHash: hashKey(plain),
      keyPrefix: plain.slice(0, 8),
      userId: owner.id,
      label: label || 'api-key',
      createdAt: now,
      revokedAt: null
    })
    return {
      ...this.toPublic(record),
      key: plain
    }
  }

  async listKeys(): Promise<ApiKeyPublicView[]> {
    const records = await this.repo.listAll()
    return records.map(r => this.toPublic(r))
  }

  async revokeKey(id: string): Promise<void> {
    const ok = await this.repo.revoke(id)
    if (!ok) {
      throw new NotFoundException({ success: false, message: 'api-key 不存在或已吊销' })
    }
  }

  private toPublic(record: {
    id: string
    keyPrefix: string
    label: string
    userId: string
    createdAt: string
    revokedAt: string | null
  }): ApiKeyPublicView {
    return {
      id: record.id,
      keyPrefix: record.keyPrefix,
      label: record.label,
      userId: record.userId,
      createdAt: record.createdAt,
      revokedAt: record.revokedAt
    }
  }
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeysService: ApiKeysService) {}

  private isLocalRequest(req: {
    ip?: string
    socket?: { remoteAddress?: string }
  }): boolean {
    const ip = req.ip || req.socket?.remoteAddress || ''
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    let key =
      req.headers['api-key'] ||
      req.headers['api_key'] ||
      req.headers['x-api-key'] ||
      ''

    if (!key && this.isLocalRequest(req)) {
      key = this.apiKeysService.readSeedKeyFromFile() || ''
    }

    if (!key) {
      throw new UnauthorizedException({ success: false, message: '缺少 api-key' })
    }

    const user = await this.apiKeysService.validateKey(String(key))
    if (!user || user.disabled) {
      throw new UnauthorizedException({ success: false, message: '无效的 api-key' })
    }

    req.user = user
    return true
  }
}

export function createApiKeyRepositoryProvider() {
  const driver = getStorageDriver()
  const localKind = getLocalStorageKind()

  if (driver === 'local' && localKind === 'json') {
    return { provide: API_KEY_REPOSITORY, useClass: JsonApiKeyRepository }
  }

  return { provide: API_KEY_REPOSITORY, useClass: SqliteApiKeyRepository }
}
