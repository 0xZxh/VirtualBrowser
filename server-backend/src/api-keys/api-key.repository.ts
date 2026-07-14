import { ApiKeyRecord } from './api-key.types'

export interface ApiKeyRepository {
  ensureSchema(): Promise<void>
  count(): Promise<number>
  create(record: ApiKeyRecord): Promise<ApiKeyRecord>
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>
  listAll(): Promise<ApiKeyRecord[]>
  revoke(id: string): Promise<boolean>
}

export const API_KEY_REPOSITORY = Symbol('API_KEY_REPOSITORY')
