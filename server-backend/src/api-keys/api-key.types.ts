export interface ApiKeyRecord {
  id: string
  keyHash: string
  keyPrefix: string
  userId: string
  label: string
  createdAt: string
  revokedAt: string | null
}

export interface ApiKeyPublicView {
  id: string
  keyPrefix: string
  label: string
  userId: string
  createdAt: string
  revokedAt: string | null
}

export interface CreatedApiKeyView extends ApiKeyPublicView {
  /** 明文 key，仅创建时返回一次 */
  key: string
}
