import { Injectable, OnModuleDestroy } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import Database from 'better-sqlite3'
import { getSqlitePath } from '../../storage.config'

@Injectable()
export class SqliteDatabaseService implements OnModuleDestroy {
  private readonly db: Database.Database

  constructor() {
    const dbPath = path.resolve(getSqlitePath())
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        roles TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT '1',
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS environments (
        env_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT '1',
        name TEXT NOT NULL,
        group_name TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tenant_id, env_id)
      );

      CREATE INDEX IF NOT EXISTS idx_environments_owner ON environments(owner_id);
    `)
    console.log(`[storage] SQLite: ${dbPath}`)
  }

  onModuleDestroy() {
    this.db.close()
  }

  getDb(): Database.Database {
    return this.db
  }
}
