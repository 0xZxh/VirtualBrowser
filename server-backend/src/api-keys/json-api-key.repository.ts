import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { getLocalJsonDir } from '../storage/storage.config'
import { ApiKeyRecord } from './api-key.types'
import { ApiKeyRepository } from './api-key.repository'

interface ApiKeyStoreFile {
  keys: ApiKeyRecord[]
}

@Injectable()
export class JsonApiKeyRepository implements ApiKeyRepository {
  private filePath = path.join(getLocalJsonDir(), 'api-keys.json')

  private readStore(): ApiKeyStoreFile {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'))
      if (raw && Array.isArray(raw.keys)) return raw as ApiKeyStoreFile
    } catch {
      //
    }
    return { keys: [] }
  }

  private writeStore(store: ApiKeyStoreFile) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(store, null, 2), 'utf8')
  }

  async ensureSchema(): Promise<void> {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    if (!fs.existsSync(this.filePath)) {
      this.writeStore({ keys: [] })
    }
  }

  async count(): Promise<number> {
    return this.readStore().keys.length
  }

  async create(record: ApiKeyRecord): Promise<ApiKeyRecord> {
    const store = this.readStore()
    store.keys.push(record)
    this.writeStore(store)
    return record
  }

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    const store = this.readStore()
    return store.keys.find(k => k.keyHash === keyHash && !k.revokedAt) ?? null
  }

  async listAll(): Promise<ApiKeyRecord[]> {
    return this.readStore().keys
  }

  async revoke(id: string): Promise<boolean> {
    const store = this.readStore()
    const item = store.keys.find(k => k.id === id && !k.revokedAt)
    if (!item) return false
    item.revokedAt = new Date().toISOString()
    this.writeStore(store)
    return true
  }
}
