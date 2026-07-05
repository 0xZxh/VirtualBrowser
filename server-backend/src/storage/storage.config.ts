export type StorageDriver = 'local' | 'mongo'
export type LocalStorageKind = 'sqlite' | 'json'

export function getStorageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === 'mongo' ? 'mongo' : 'local'
}

export function getLocalStorageKind(): LocalStorageKind {
  return process.env.LOCAL_STORAGE === 'json' ? 'json' : 'sqlite'
}

export function getSqlitePath(): string {
  return process.env.SQLITE_PATH || './data/local/app.db'
}

export function getLocalJsonDir(): string {
  return process.env.LOCAL_JSON_DIR || './data/local'
}

export function getMongoUri(): string {
  return process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/virtualbrowser'
}
