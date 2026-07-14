import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import { getSqlitePath } from '../storage/storage.config'
import { ApiKeyRecord } from './api-key.types'
import { ApiKeyRepository } from './api-key.repository'

@Injectable()
export class SqliteApiKeyRepository implements ApiKeyRepository {
  private db: Database.Database

  constructor() {
    const dbPath = path.resolve(getSqlitePath())
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
  }

  async ensureSchema(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        key_hash TEXT UNIQUE NOT NULL,
        key_prefix TEXT NOT NULL,
        user_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
    `)
  }

  async count(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) AS c FROM api_keys').get() as { c: number }
    return row?.c ?? 0
  }

  async create(record: ApiKeyRecord): Promise<ApiKeyRecord> {
    this.db
      .prepare(
        `INSERT INTO api_keys (id, key_hash, key_prefix, user_id, label, created_at, revoked_at)
         VALUES (@id, @keyHash, @keyPrefix, @userId, @label, @createdAt, @revokedAt)`
      )
      .run({
        id: record.id,
        keyHash: record.keyHash,
        keyPrefix: record.keyPrefix,
        userId: record.userId,
        label: record.label,
        createdAt: record.createdAt,
        revokedAt: record.revokedAt
      })
    return record
  }

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const row = this.db
      .prepare(
        `SELECT id, key_hash AS keyHash, key_prefix AS keyPrefix, user_id AS userId,
                label, created_at AS createdAt, revoked_at AS revokedAt
         FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`
      )
      .get(keyHash) as ApiKeyRecord | undefined
    return row ?? null
  }

  async listAll(): Promise<ApiKeyRecord[]> {
    return this.db
      .prepare(
        `SELECT id, key_hash AS keyHash, key_prefix AS keyPrefix, user_id AS userId,
                label, created_at AS createdAt, revoked_at AS revokedAt
         FROM api_keys ORDER BY created_at DESC`
      )
      .all() as ApiKeyRecord[]
  }

  async revoke(id: string): Promise<boolean> {
    const result = this.db
      .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
      .run(new Date().toISOString(), id)
    return result.changes > 0
  }
}
