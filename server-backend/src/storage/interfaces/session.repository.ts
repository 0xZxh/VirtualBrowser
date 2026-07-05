export interface SessionRecord {
  token: string
  userId: string
  expiresAt: Date
}

export interface SessionRepository {
  create(token: string, userId: string, expiresAt: Date): Promise<void>
  deleteByToken(token: string): Promise<void>
  findByToken(token: string): Promise<SessionRecord | null>
}
