import { Injectable } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'
import { EnvironmentsService } from '../environments/environments.service'
import { BrowserEnvironmentItem } from '../environments/environment.types'
import { UserRecord } from '../users/user.types'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getWorkersRoot, getBrowserListFile } = require('../../../config/vb-paths')

const workersRoot = getWorkersRoot() as string
const listFile = getBrowserListFile() as string

@Injectable()
export class NativeSyncService {
  constructor(private environmentsService: EnvironmentsService) {}

  private ensureDir(dir: string) {
    fs.mkdirSync(dir, { recursive: true })
  }

  private writeJson(file: string, data: unknown) {
    this.ensureDir(path.dirname(file))
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
  }

  private toListItem(item: BrowserEnvironmentItem): Record<string, unknown> {
    const { ownerId: _o, tenantId: _t, ...rest } = item
    return rest
  }

  async syncForUser(user: UserRecord): Promise<void> {
    const items = await this.environmentsService.listForUser(user)
    const users = items.map(item => this.toListItem(item))
    this.writeJson(listFile, { users })
    this.syncWorkerProfiles(users)
  }

  async syncEnv(user: UserRecord, envId: string): Promise<void> {
    await this.syncForUser(user)
    const items = await this.environmentsService.listForUser(user)
    const item = items.find(i => String(i.id) === String(envId))
    if (!item) return

    const workerDir = path.join(workersRoot, String(envId))
    this.ensureDir(workerDir)
    this.writeJson(path.join(workerDir, 'virtual.dat'), { users: [this.toListItem(item)] })
  }

  private syncWorkerProfiles(users: Record<string, unknown>[]) {
    this.ensureDir(workersRoot)
    for (const item of users) {
      const id = String(item.id ?? '')
      if (!id) continue
      const workerDir = path.join(workersRoot, id)
      this.ensureDir(workerDir)
      this.writeJson(path.join(workerDir, 'virtual.dat'), { users: [item] })
    }
  }
}
