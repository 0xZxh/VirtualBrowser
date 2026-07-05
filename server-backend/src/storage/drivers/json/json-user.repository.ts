import { Injectable } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { UserRecord } from '../../../users/user.types'
import {
  CreateUserInput,
  UpdateUserInput,
  UserRepository
} from '../../interfaces/user.repository'
import { JsonStoreService } from './json-store.service'

@Injectable()
export class JsonUserRepository implements UserRepository {
  constructor(private store: JsonStoreService) {}

  async count(): Promise<number> {
    return this.store.readUsers().length
  }

  async findAll(): Promise<UserRecord[]> {
    return this.store.readUsers().map(row => this.mapRow(row))
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const users = this.store.readUsers()
    const record = {
      id: randomUUID(),
      username: input.username,
      passwordHash: input.passwordHash,
      name: input.name,
      roles: input.roles,
      tenantId: input.tenantId,
      disabled: false,
      createdAt: new Date().toISOString()
    }
    users.push(record)
    this.store.writeUsers(users)
    return this.mapRow(record)
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const user = this.store.readUsers().find(u => u.username === username)
    return user ? this.mapRow(user) : null
  }

  async findById(id: string): Promise<UserRecord | null> {
    const user = this.store.readUsers().find(u => u.id === id)
    return user ? this.mapRow(user) : null
  }

  async update(id: string, input: UpdateUserInput): Promise<UserRecord | null> {
    const users = this.store.readUsers()
    const index = users.findIndex(u => u.id === id)
    if (index < 0) return null

    const current = users[index]
    users[index] = {
      ...current,
      name: input.name ?? current.name,
      roles: input.roles ?? current.roles,
      tenantId: input.tenantId ?? current.tenantId,
      disabled: input.disabled ?? current.disabled
    }
    this.store.writeUsers(users)
    return this.mapRow(users[index])
  }

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const users = this.store.readUsers()
    const index = users.findIndex(u => u.id === id)
    if (index < 0) return false
    users[index].passwordHash = passwordHash
    this.store.writeUsers(users)
    return true
  }

  private mapRow(row: {
    id: string
    username: string
    passwordHash: string
    name: string
    roles: string[]
    tenantId: string
    disabled: boolean
    createdAt: string
  }): UserRecord {
    return {
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      name: row.name,
      roles: row.roles,
      tenantId: row.tenantId,
      disabled: row.disabled,
      createdAt: row.createdAt
    }
  }
}
