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
import { withEnvironmentDefaults } from '../browser/fingerprint.defaults'
import { addGroup, listGroups, GroupItem } from '../browser/groups.store'

export const DEFAULT_GROUP_NAME = '默认分组'

@Injectable()
export class EnvironmentsService {
  constructor(@Inject(ENVIRONMENT_REPOSITORY) private envRepository: EnvironmentRepository) {}

  isAdmin(user: UserRecord): boolean {
    return user.roles.includes('admin')
  }

  /** Ensure group exists in global catalog; returns canonical name. */
  ensureGroup(name: unknown): GroupItem {
    const next = String(name ?? '').trim() || DEFAULT_GROUP_NAME
    if (next === DEFAULT_GROUP_NAME) {
      return { id: 0, name: DEFAULT_GROUP_NAME }
    }
    const existing = listGroups().find(g => g.name === next)
    if (existing) return existing
    return addGroup(next)
  }

  /** Groups from catalog + names used by user's environments. */
  async listGroupsForUser(user: UserRecord): Promise<Array<{ id: number; name: string; count: number }>> {
    const items = await this.listForUser(user)
    const counts = new Map<string, number>()
    for (const item of items) {
      const g = String(item.group || '').trim() || DEFAULT_GROUP_NAME
      counts.set(g, (counts.get(g) || 0) + 1)
    }

    const byName = new Map<string, { id: number; name: string; count: number }>()
    byName.set(DEFAULT_GROUP_NAME, {
      id: 0,
      name: DEFAULT_GROUP_NAME,
      count: counts.get(DEFAULT_GROUP_NAME) || 0
    })

    for (const g of listGroups()) {
      const name = String(g.name || '').trim()
      if (!name) continue
      byName.set(name, {
        id: Number.isFinite(g.id) ? g.id : byName.size + 1,
        name,
        count: counts.get(name) || 0
      })
    }

    for (const [name, count] of counts) {
      if (!byName.has(name)) {
        byName.set(name, { id: byName.size + 1000, name, count })
      }
    }

    return Array.from(byName.values()).sort((a, b) => {
      if (a.name === DEFAULT_GROUP_NAME) return -1
      if (b.name === DEFAULT_GROUP_NAME) return 1
      return a.name.localeCompare(b.name, 'zh')
    })
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
    const prepared = withEnvironmentDefaults(item || {})
    const groupItem = this.ensureGroup(prepared.group)
    prepared.group = groupItem.name
    const record = fromBrowserItem(
      {
        ...prepared,
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

    // 局部更新：与当前环境合并，避免只传 os/ua 时把 name/group 冲成 id/空串
    const currentItem = toBrowserItem(current)
    const nextGroup =
      item.group != null ? this.ensureGroup(item.group).name : currentItem.group
    const next = fromBrowserItem(
      {
        ...currentItem,
        ...item,
        id: item.id ?? envId,
        name: item.name != null && item.name !== '' ? item.name : currentItem.name,
        group: nextGroup
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

  async createBatch(
    user: UserRecord,
    items: BrowserEnvironmentItem[]
  ): Promise<{ created: BrowserEnvironmentItem[] }> {
    const created: BrowserEnvironmentItem[] = []
    for (const item of items || []) {
      created.push(await this.create(user, item || {}))
    }
    return { created }
  }

  async removeBatch(
    user: UserRecord,
    ids: Array<string | number>
  ): Promise<{ deleted: string[]; failed: Array<{ id: string; message: string }> }> {
    const deleted: string[] = []
    const failed: Array<{ id: string; message: string }> = []
    for (const raw of ids || []) {
      const id = String(raw ?? '').trim()
      if (!id) {
        failed.push({ id: String(raw), message: '无效 id' })
        continue
      }
      try {
        await this.remove(user, id)
        deleted.push(id)
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: unknown }).message || err)
            : String(err)
        failed.push({ id, message })
      }
    }
    return { deleted, failed }
  }

  async updateGroupBatch(
    user: UserRecord,
    ids: Array<string | number>,
    group: string
  ): Promise<{ updated: BrowserEnvironmentItem[]; failed: Array<{ id: string; message: string }> }> {
    const nextGroup = this.ensureGroup(group).name
    const updated: BrowserEnvironmentItem[] = []
    const failed: Array<{ id: string; message: string }> = []
    for (const raw of ids || []) {
      const id = String(raw ?? '').trim()
      if (!id) {
        failed.push({ id: String(raw), message: '无效 id' })
        continue
      }
      try {
        const current = await this.assertCanAccess(user, id)
        const item = toBrowserItem(current)
        item.group = nextGroup
        updated.push(await this.update(user, id, item))
      } catch (err) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message?: unknown }).message || err)
            : String(err)
        failed.push({ id, message })
      }
    }
    return { updated, failed }
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
