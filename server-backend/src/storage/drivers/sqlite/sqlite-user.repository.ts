import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { UserRecord } from '../../../users/user.types'
import {
  CreateUserInput,
  UpdateUserInput,
  UserRepository
} from '../../interfaces/user.repository'
import { SqliteDatabaseService } from './sqlite-database.service'

interface UserRow {
  id: string
  username: string
  password_hash: string
  name: string
  roles: string
  tenant_id: string
  disabled: number
  created_at: string
}

@Injectable()
export class SqliteUserRepository implements UserRepository {
  constructor(private sqlite: SqliteDatabaseService) {}

  async count(): Promise<number> {
    const row = this.sqlite.getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
    return row.c
  }

  async findAll(): Promise<UserRecord[]> {
    const rows = this.sqlite.getDb().prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[]
    return rows.map(row => this.mapRow(row))
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    this.sqlite
      .getDb()
      .prepare(
        `INSERT INTO users (id, username, password_hash, name, roles, tenant_id, disabled, created_at)
         VALUES (@id, @username, @passwordHash, @name, @roles, @tenantId, 0, @createdAt)`
      )
      .run({
        id,
        username: input.username,
        passwordHash: input.passwordHash,
        name: input.name,
        roles: JSON.stringify(input.roles),
        tenantId: input.tenantId,
        createdAt
      })
    return (await this.findById(id))!
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const row = this.sqlite
      .getDb()
      .prepare('SELECT * FROM users WHERE username = ?')
      .get(username) as UserRow | undefined
    return row ? this.mapRow(row) : null
  }

  async findById(id: string): Promise<UserRecord | null> {
    const row = this.sqlite.getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | UserRow
      | undefined
    return row ? this.mapRow(row) : null
  }

  async update(id: string, input: UpdateUserInput): Promise<UserRecord | null> {
    const current = await this.findById(id)
    if (!current) return null

    const next = {
      name: input.name ?? current.name,
      roles: input.roles ?? current.roles,
      tenantId: input.tenantId ?? current.tenantId,
      disabled: input.disabled ?? current.disabled
    }

    this.sqlite
      .getDb()
      .prepare(
        `UPDATE users SET name = @name, roles = @roles, tenant_id = @tenantId, disabled = @disabled
         WHERE id = @id`
      )
      .run({
        id,
        name: next.name,
        roles: JSON.stringify(next.roles),
        tenantId: next.tenantId,
        disabled: next.disabled ? 1 : 0
      })

    return this.findById(id)
  }

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = this.sqlite
      .getDb()
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(passwordHash, id)
    return result.changes > 0
  }

  private mapRow(row: UserRow): UserRecord {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      name: row.name,
      roles: JSON.parse(row.roles),
      tenantId: row.tenant_id,
      disabled: row.disabled === 1,
      createdAt: row.created_at
    }
  }
}
