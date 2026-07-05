import { Injectable } from '@nestjs/common'
import { EnvironmentRecord } from '../../../environments/environment.types'
import { EnvironmentRepository } from '../../interfaces/environment.repository'
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
