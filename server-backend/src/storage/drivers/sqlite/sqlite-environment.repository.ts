import { Injectable } from '@nestjs/common'
import { EnvironmentRecord } from '../../../environments/environment.types'
import { EnvironmentRepository } from '../../interfaces/environment.repository'
import { SqliteDatabaseService } from './sqlite-database.service'

interface EnvironmentRow {
  env_id: string
  owner_id: string
  tenant_id: string
  name: string
  group_name: string
  payload: string
  created_at: string
  updated_at: string
}

@Injectable()
export class SqliteEnvironmentRepository implements EnvironmentRepository {
  constructor(private sqlite: SqliteDatabaseService) {}

  async findByTenant(tenantId: string): Promise<EnvironmentRecord[]> {
    const rows = this.sqlite
      .getDb()
      .prepare('SELECT * FROM environments WHERE tenant_id = ? ORDER BY env_id ASC')
      .all(tenantId) as EnvironmentRow[]
    return rows.map(row => this.mapRow(row))
  }

  async findByOwner(ownerId: string): Promise<EnvironmentRecord[]> {
    const rows = this.sqlite
      .getDb()
      .prepare('SELECT * FROM environments WHERE owner_id = ? ORDER BY env_id ASC')
      .all(ownerId) as EnvironmentRow[]
    return rows.map(row => this.mapRow(row))
  }

  async findByEnvId(envId: string): Promise<EnvironmentRecord | null> {
    const row = this.sqlite
      .getDb()
      .prepare('SELECT * FROM environments WHERE env_id = ? LIMIT 1')
      .get(envId) as EnvironmentRow | undefined
    return row ? this.mapRow(row) : null
  }

  async findByEnvIdAndTenant(envId: string, tenantId: string): Promise<EnvironmentRecord | null> {
    const row = this.sqlite
      .getDb()
      .prepare('SELECT * FROM environments WHERE env_id = ? AND tenant_id = ?')
      .get(envId, tenantId) as EnvironmentRow | undefined
    return row ? this.mapRow(row) : null
  }

  async create(record: EnvironmentRecord): Promise<EnvironmentRecord> {
    this.sqlite
      .getDb()
      .prepare(
        `INSERT INTO environments
         (env_id, owner_id, tenant_id, name, group_name, payload, created_at, updated_at)
         VALUES (@envId, @ownerId, @tenantId, @name, @group, @payload, @createdAt, @updatedAt)`
      )
      .run({
        envId: record.envId,
        ownerId: record.ownerId,
        tenantId: record.tenantId,
        name: record.name,
        group: record.group,
        payload: JSON.stringify(record.payload || {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      })
    return (await this.findByEnvIdAndTenant(record.envId, record.tenantId))!
  }

  async update(envId: string, patch: Partial<EnvironmentRecord>): Promise<EnvironmentRecord | null> {
    const current = await this.findByEnvId(envId)
    if (!current) return null

    const next: EnvironmentRecord = {
      ...current,
      ...patch,
      envId: current.envId,
      tenantId: patch.tenantId ?? current.tenantId,
      updatedAt: new Date().toISOString()
    }

    this.sqlite
      .getDb()
      .prepare(
        `UPDATE environments
         SET owner_id = @ownerId, name = @name, group_name = @group, payload = @payload, updated_at = @updatedAt
         WHERE tenant_id = @tenantId AND env_id = @envId`
      )
      .run({
        envId: next.envId,
        tenantId: next.tenantId,
        ownerId: next.ownerId,
        name: next.name,
        group: next.group,
        payload: JSON.stringify(next.payload || {}),
        updatedAt: next.updatedAt
      })

    return this.findByEnvIdAndTenant(next.envId, next.tenantId)
  }

  async delete(envId: string): Promise<boolean> {
    const result = this.sqlite.getDb().prepare('DELETE FROM environments WHERE env_id = ?').run(envId)
    return result.changes > 0
  }

  private mapRow(row: EnvironmentRow): EnvironmentRecord {
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(row.payload)
    } catch {
      payload = {}
    }
    return {
      envId: row.env_id,
      ownerId: row.owner_id,
      tenantId: row.tenant_id,
      name: row.name,
      group: row.group_name,
      payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
