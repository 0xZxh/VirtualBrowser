import { Injectable } from '@nestjs/common'
import { SessionRecord, SessionRepository } from '../../interfaces/session.repository'
import { JsonStoreService } from './json-store.service'

@Injectable()
export class JsonSessionRepository implements SessionRepository {
  constructor(private store: JsonStoreService) {}

  async create(token: string, userId: string, expiresAt: Date): Promise<void> {
    const sessions = this.store.readSessions()
    sessions.push({
      token,
      userId,
      expiresAt: expiresAt.toISOString()
    })
    this.store.writeSessions(sessions)
  }

  async deleteByToken(token: string): Promise<void> {
    const sessions = this.store.readSessions().filter(s => s.token !== token)
    this.store.writeSessions(sessions)
  }

  async findByToken(token: string): Promise<SessionRecord | null> {
    const row = this.store.readSessions().find(s => s.token === token)
    if (!row) return null
    return {
      token: row.token,
      userId: row.userId,
      expiresAt: new Date(row.expiresAt)
    }
  }
}
