import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { getLocalJsonDir } from '../../storage.config'

export interface JsonUserRow {
  id: string
  username: string
  passwordHash: string
  name: string
  roles: string[]
  tenantId: string
  disabled: boolean
  createdAt: string
}

export interface JsonSessionRow {
  token: string
  userId: string
  expiresAt: string
}

export interface JsonEnvironmentRow {
  envId: string
  ownerId: string
  tenantId: string
  name: string
  group: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

@Injectable()
export class JsonStoreService {
  private readonly dir: string
  readonly usersFile: string
  readonly sessionsFile: string
  readonly environmentsFile: string

  constructor() {
    this.dir = path.resolve(getLocalJsonDir())
    this.usersFile = path.join(this.dir, 'users.json')
    this.sessionsFile = path.join(this.dir, 'sessions.json')
    this.environmentsFile = path.join(this.dir, 'environments.json')
    fs.mkdirSync(this.dir, { recursive: true })
    if (!fs.existsSync(this.usersFile)) {
      fs.writeFileSync(this.usersFile, '[]', 'utf8')
    }
    if (!fs.existsSync(this.sessionsFile)) {
      fs.writeFileSync(this.sessionsFile, '[]', 'utf8')
    }
    if (!fs.existsSync(this.environmentsFile)) {
      fs.writeFileSync(this.environmentsFile, '[]', 'utf8')
    }
    console.log(`[storage] JSON: ${this.dir}`)
  }

  readUsers(): JsonUserRow[] {
    return JSON.parse(fs.readFileSync(this.usersFile, 'utf8'))
  }

  writeUsers(users: JsonUserRow[]): void {
    fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2), 'utf8')
  }

  readSessions(): JsonSessionRow[] {
    return JSON.parse(fs.readFileSync(this.sessionsFile, 'utf8'))
  }

  writeSessions(sessions: JsonSessionRow[]): void {
    fs.writeFileSync(this.sessionsFile, JSON.stringify(sessions, null, 2), 'utf8')
  }

  readEnvironments(): JsonEnvironmentRow[] {
    return JSON.parse(fs.readFileSync(this.environmentsFile, 'utf8'))
  }

  writeEnvironments(rows: JsonEnvironmentRow[]): void {
    fs.writeFileSync(this.environmentsFile, JSON.stringify(rows, null, 2), 'utf8')
  }
}
