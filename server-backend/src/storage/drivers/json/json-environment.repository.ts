import { Injectable } from '@nestjs/common'
import { EnvironmentRecord } from '../../../environments/environment.types'
import {
  EnvironmentListFilter,
  EnvironmentPageOptions,
  EnvironmentRepository
} from '../../interfaces/environment.repository'
import { JsonEnvironmentRow, JsonStoreService } from './json-store.service'

@Injectable()
export class JsonEnvironmentRepository implements EnvironmentRepository {
  constructor(private store: JsonStoreService) {}

  async findByTenant(tenantId: string): Promise<EnvironmentRecord[]> {
    return this.store
      .readEnvironments()
      .filter(row => row.tenantId === tenantId)
      .sort((a, b) => a.envId.localeCompare(b.envId, undefined, { numeric: true }))
      .map(row => this.mapRow(row))
  }

  async findByOwner(ownerId: string): Promise<EnvironmentRecord[]> {
    return this.store
      .readEnvironments()
      .filter(row => row.ownerId === ownerId)
      .sort((a, b) => a.envId.localeCompare(b.envId, undefined, { numeric: true }))
      .map(row => this.mapRow(row))
  }

  async findByEnvId(envId: string): Promise<EnvironmentRecord | null> {
    const row = this.store.readEnvironments().find(item => item.envId === envId)
    return row ? this.mapRow(row) : null
  }

  async findByEnvIdAndTenant(envId: string, tenantId: string): Promise<EnvironmentRecord | null> {
    const row = this.store
      .readEnvironments()
      .find(item => item.envId === envId && item.tenantId === tenantId)
    return row ? this.mapRow(row) : null
  }

  async findPage(
    filter: EnvironmentListFilter,
    options: EnvironmentPageOptions
  ): Promise<EnvironmentRecord[]> {
    const skip = Math.max(0, options.skip || 0)
    const limit = Math.max(1, options.limit || 20)
    return this.filterRows(filter)
      .slice(skip, skip + limit)
      .map(row => this.mapRow(row))
  }

  async count(filter: EnvironmentListFilter): Promise<number> {
    return this.filterRows(filter).length
  }

  async getMaxEnvId(tenantId: string): Promise<number> {
    return this.store.readEnvironments().reduce((acc, row) => {
      if (row.tenantId !== tenantId) return acc
      const n = parseInt(row.envId, 10)
      return Number.isFinite(n) ? Math.max(acc, n) : acc
    }, 0)
  }

  async create(record: EnvironmentRecord): Promise<EnvironmentRecord> {
    const rows = this.store.readEnvironments()
    rows.push(this.toRow(record))
    this.store.writeEnvironments(rows)
    return record
  }

  async update(envId: string, patch: Partial<EnvironmentRecord>): Promise<EnvironmentRecord | null> {
    const rows = this.store.readEnvironments()
    const idx = rows.findIndex(row => row.envId === envId)
    if (idx < 0) return null

    const current = this.mapRow(rows[idx])
    const next: EnvironmentRecord = {
      ...current,
      ...patch,
      envId: current.envId,
      tenantId: patch.tenantId ?? current.tenantId,
      updatedAt: new Date().toISOString()
    }
    rows[idx] = this.toRow(next)
    this.store.writeEnvironments(rows)
    return next
  }

  async delete(envId: string): Promise<boolean> {
    const rows = this.store.readEnvironments()
    const next = rows.filter(row => row.envId !== envId)
    if (next.length === rows.length) return false
    this.store.writeEnvironments(next)
    return true
  }

  private filterRows(filter: EnvironmentListFilter): JsonEnvironmentRow[] {
    const q = filter.q != null ? String(filter.q).trim().toLowerCase() : ''
    return this.store
      .readEnvironments()
      .filter(row => {
        if (filter.tenantId && row.tenantId !== filter.tenantId) return false
        if (filter.ownerId && row.ownerId !== filter.ownerId) return false
        if (filter.group && row.group !== filter.group) return false
        if (q) {
          const name = String(row.name || '').toLowerCase()
          const envId = String(row.envId || '').toLowerCase()
          if (!name.includes(q) && !envId.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => a.envId.localeCompare(b.envId, undefined, { numeric: true }))
  }

  private mapRow(row: JsonEnvironmentRow): EnvironmentRecord {
    return {
      envId: row.envId,
      ownerId: row.ownerId,
      tenantId: row.tenantId,
      name: row.name,
      group: row.group,
      payload: row.payload || {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    }
  }

  private toRow(record: EnvironmentRecord): JsonEnvironmentRow {
    return {
      envId: record.envId,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      name: record.name,
      group: record.group,
      payload: record.payload || {},
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }
}
