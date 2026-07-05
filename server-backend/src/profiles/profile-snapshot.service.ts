import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { createReadStream, ReadStream } from 'fs'

export interface SnapshotMeta {
  envId: string
  tenantId: string
  version: number
  size: number
  updatedAt: string
}

@Injectable()
export class ProfileSnapshotService {
  private readonly dataRoot: string

  constructor() {
    const baseDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
    this.dataRoot = path.join(baseDir, 'profiles')
  }

  private safeSegment(value: string): string {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  private getEnvDir(tenantId: string, envId: string): string {
    return path.join(this.dataRoot, this.safeSegment(tenantId), this.safeSegment(envId))
  }

  private getLegacyEnvDir(envId: string): string {
    return path.join(this.dataRoot, this.safeSegment(envId))
  }

  private resolveEnvDir(tenantId: string, envId: string): string | null {
    const tenantDir = this.getEnvDir(tenantId, envId)
    if (fs.existsSync(path.join(tenantDir, 'snapshot.zip'))) {
      return tenantDir
    }

    const legacyDir = this.getLegacyEnvDir(envId)
    if (fs.existsSync(path.join(legacyDir, 'snapshot.zip'))) {
      return legacyDir
    }

    return tenantDir
  }

  private getSnapshotPath(tenantId: string, envId: string): string {
    const envDir = this.resolveEnvDir(tenantId, envId) || this.getEnvDir(tenantId, envId)
    return path.join(envDir, 'snapshot.zip')
  }

  private getMetaPath(tenantId: string, envId: string): string {
    const envDir = this.resolveEnvDir(tenantId, envId) || this.getEnvDir(tenantId, envId)
    return path.join(envDir, 'meta.json')
  }

  private readMeta(tenantId: string, envId: string): SnapshotMeta | null {
    const metaPath = this.getMetaPath(tenantId, envId)
    if (!fs.existsSync(metaPath)) return null
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    } catch {
      return null
    }
  }

  private writeMeta(tenantId: string, envId: string, meta: SnapshotMeta): void {
    const envDir = this.getEnvDir(tenantId, envId)
    fs.mkdirSync(envDir, { recursive: true })
    fs.writeFileSync(path.join(envDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
  }

  getSnapshotMeta(tenantId: string, envId: string): SnapshotMeta | null {
    const snapshotPath = this.getSnapshotPath(tenantId, envId)
    if (!fs.existsSync(snapshotPath)) return null

    const stored = this.readMeta(tenantId, envId)
    const stat = fs.statSync(snapshotPath)

    if (stored) {
      return {
        envId: String(envId),
        tenantId: stored.tenantId || tenantId,
        version: stored.version,
        size: stat.size,
        updatedAt: stored.updatedAt
      }
    }

    return {
      envId: String(envId),
      tenantId,
      version: 1,
      size: stat.size,
      updatedAt: stat.mtime.toISOString()
    }
  }

  saveSnapshot(tenantId: string, envId: string, buffer: Buffer): SnapshotMeta {
    const envDir = this.getEnvDir(tenantId, envId)
    fs.mkdirSync(envDir, { recursive: true })

    const prev = this.readMeta(tenantId, envId)
    const version = prev ? prev.version + 1 : 1
    const updatedAt = new Date().toISOString()

    fs.writeFileSync(path.join(envDir, 'snapshot.zip'), buffer)

    const meta: SnapshotMeta = {
      envId: String(envId),
      tenantId,
      version,
      size: buffer.length,
      updatedAt
    }
    this.writeMeta(tenantId, envId, meta)
    return meta
  }

  openSnapshotStream(tenantId: string, envId: string): ReadStream | null {
    const snapshotPath = this.getSnapshotPath(tenantId, envId)
    if (!fs.existsSync(snapshotPath)) return null
    return createReadStream(snapshotPath)
  }
}
