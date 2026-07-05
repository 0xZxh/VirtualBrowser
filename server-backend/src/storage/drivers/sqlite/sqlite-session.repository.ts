import { Injectable } from '@nestjs/common'
import { SessionRecord, SessionRepository } from '../../interfaces/session.repository'
import { SqliteDatabaseService } from './sqlite-database.service'

interface SessionRow {
  token: string
  user_id: string
  expires_at: string
}

@Injectable()
export class SqliteSessionRepository implements SessionRepository {
  constructor(private sqlite: SqliteDatabaseService) {}

  async create(token: string, userId: string, expiresAt: Date): Promise<void> {
    this.sqlite
      .getDb()
      .prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
      .run(token, userId, expiresAt.toISOString())
  }

  async deleteByToken(token: string): Promise<void> {
    this.sqlite.getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token)
  }

  async findByToken(token: string): Promise<SessionRecord | null> {
    const row = this.sqlite
      .getDb()
      .prepare('SELECT * FROM sessions WHERE token = ?')
      .get(token) as SessionRow | undefined
    if (!row) return null
    return {
      token: row.token,
      userId: row.user_id,
      expiresAt: new Date(row.expires_at)
    }
  }
}
