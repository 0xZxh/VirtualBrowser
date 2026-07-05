import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ENVIRONMENT_REPOSITORY } from '../storage/storage.constants'
import { EnvironmentRepository } from '../storage/interfaces/environment.repository'
import { UserRecord } from '../users/user.types'
import {
  BrowserEnvironmentItem,
  EnvironmentRecord,
  fromBrowserItem,
  toBrowserItem
} from './environment.types'

@Injectable()
export class EnvironmentsService {
  constructor(@Inject(ENVIRONMENT_REPOSITORY) private envRepository: EnvironmentRepository) {}

  isAdmin(user: UserRecord): boolean {
    return user.roles.includes('admin')
  }

  async listForUser(user: UserRecord): Promise<BrowserEnvironmentItem[]> {
    const records = this.isAdmin(user)
      ? await this.envRepository.findByTenant(user.tenantId)
      : await this.envRepository.findByOwner(user.id)
    return records.map(toBrowserItem)
  }

  async assertCanAccess(user: UserRecord, envId: string): Promise<EnvironmentRecord> {
    const record = await this.envRepository.findByEnvIdAndTenant(envId, user.tenantId)
    if (!record) {
      throw new NotFoundException({ code: 404, message: '环境不存在', envId })
    }

    if (this.isAdmin(user)) {
      return record
    }

    if (record.ownerId !== user.id) {
      throw new ForbiddenException({ code: 403, message: '无权访问该环境', envId })
    }

    return record
  }

  private async nextEnvId(tenantId: string): Promise<string> {
    const records = await this.envRepository.findByTenant(tenantId)
    const max = records.reduce((acc, item) => {
      const n = parseInt(item.envId, 10)
      return Number.isFinite(n) ? Math.max(acc, n) : acc
    }, 0)
    return String(max + 1)
  }

  async create(user: UserRecord, item: BrowserEnvironmentItem): Promise<BrowserEnvironmentItem> {
    const envId = await this.nextEnvId(user.tenantId)
    const record = fromBrowserItem(
      {
        ...item,
        id: Number(envId)
      },
      user.id,
      user.tenantId,
      envId
    )
    if (!record.name) {
      record.name = envId
    }
    const created = await this.envRepository.create(record)
    return toBrowserItem(created)
  }

  async update(
    user: UserRecord,
    envId: string,
    item: BrowserEnvironmentItem
  ): Promise<BrowserEnvironmentItem> {
    const current = await this.assertCanAccess(user, envId)

    if (!this.isAdmin(user) && current.ownerId !== user.id) {
      throw new ForbiddenException({ code: 403, message: '无权修改该环境', envId })
    }

    const next = fromBrowserItem(
      {
        ...item,
        id: item.id ?? envId
      },
      current.ownerId,
      current.tenantId,
      envId
    )
    next.createdAt = current.createdAt

    const updated = await this.envRepository.update(envId, {
      name: next.name,
      group: next.group,
      payload: next.payload,
      ownerId: next.ownerId
    })

    if (!updated) {
      throw new NotFoundException({ code: 404, message: '环境不存在', envId })
    }

    return toBrowserItem(updated)
  }

  async remove(user: UserRecord, envId: string): Promise<void> {
    await this.assertCanAccess(user, envId)
    const ok = await this.envRepository.delete(envId)
    if (!ok) {
      throw new NotFoundException({ code: 404, message: '环境不存在', envId })
    }
  }

  /** admin 一次性导入 legacy browser-list（跳过已存在 envId） */
  async importLegacy(
    user: UserRecord,
    items: BrowserEnvironmentItem[]
  ): Promise<{ imported: number; skipped: number }> {
    if (!this.isAdmin(user)) {
      throw new ForbiddenException({ code: 403, message: '仅 admin 可导入环境' })
    }

    let imported = 0
    let skipped = 0

    for (const item of items || []) {
      const envId = String(item.id ?? '').trim()
      if (!envId) {
        skipped++
        continue
      }

      const existing = await this.envRepository.findByEnvIdAndTenant(envId, user.tenantId)
      if (existing) {
        skipped++
        continue
      }

      const record = fromBrowserItem({ ...item, id: envId }, user.id, user.tenantId, envId)
      if (!record.name) {
        record.name = envId
      }
      await this.envRepository.create(record)
      imported++
    }

    return { imported, skipped }
  }
}
