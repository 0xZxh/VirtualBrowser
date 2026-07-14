import {
  BadRequestException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { EnvironmentsService } from '../environments/environments.service'
import { BrowserEnvironmentItem } from '../environments/environment.types'
import { UserRecord } from '../users/user.types'
import { nativeRuntimeBridge } from './native-runtime.bridge'
import { NativeSyncService } from './native-sync.service'
import { CdpProxyService } from './cdp-proxy.service'
import { addGroup, deleteGroup, listGroups, updateGroup } from './groups.store'
import { randomizeFingerprintFields } from './fingerprint.randomize'
import { clearBrowserCacheDirs, deleteBrowserDataDir } from './worker-fs'

@Injectable()
export class BrowserService {
  private readonly envProxyPorts = new Map<string, number>()

  constructor(
    private environmentsService: EnvironmentsService,
    private nativeSyncService: NativeSyncService,
    private cdpProxyService: CdpProxyService
  ) {}

  async getBrowserList(user: UserRecord, group?: string) {
    let items = await this.environmentsService.listForUser(user)
    if (group) {
      items = items.filter(item => String(item.group || '') === String(group))
    }
    const users = items.map(item => ({
      id: Number(item.id),
      name: item.name,
      group: item.group || ''
    }))
    return { success: true, data: { users } }
  }

  async addBrowser(user: UserRecord, body: Record<string, unknown>) {
    const name = String(body.name || '').trim()
    if (!name) {
      throw new BadRequestException({ success: false, message: 'name 必填' })
    }

    const groupArr = body.group
    const group = Array.isArray(groupArr)
      ? String(groupArr[0] || '')
      : String(groupArr || body.groupName || '')

    const item: BrowserEnvironmentItem = {
      id: 0,
      name,
      group,
      ...this.extractPayload(body)
    }

    const created = await this.environmentsService.create(user, item)
    await this.nativeSyncService.syncEnv(user, String(created.id))
    return { success: true, data: { id: Number(created.id) } }
  }

  async updateBrowser(user: UserRecord, body: Record<string, unknown>) {
    const envId = String(body.id ?? '').trim()
    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }

    const current = await this.environmentsService.assertCanAccess(user, envId)
    const currentItem = {
      id: current.envId,
      name: current.name,
      group: current.group,
      ...current.payload
    } as BrowserEnvironmentItem

    const groupArr = body.group
    const nextGroup = groupArr != null
      ? Array.isArray(groupArr)
        ? String(groupArr[0] || '')
        : String(groupArr)
      : currentItem.group

    const next: BrowserEnvironmentItem = {
      ...currentItem,
      name: body.name != null ? String(body.name) : currentItem.name,
      group: nextGroup,
      ...this.extractPayload(body)
    }

    await this.environmentsService.update(user, envId, next)
    await this.nativeSyncService.syncEnv(user, envId)
    return { success: true }
  }

  async deleteBrowser(user: UserRecord, body: Record<string, unknown>) {
    const envId = String(body.id ?? '').trim()
    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }

    await this.environmentsService.assertCanAccess(user, envId)

    const running = nativeRuntimeBridge.getRunningIds()
    if (running.includes(envId)) {
      await nativeRuntimeBridge.stopBrowser(envId)
    }

    await nativeRuntimeBridge.handleNativeCall('deleteBrowser', [envId])
    await this.environmentsService.remove(user, envId)
    await this.nativeSyncService.syncForUser(user)
    return { success: true }
  }

  async launchBrowser(
    user: UserRecord,
    body: Record<string, unknown>,
    req?: { headers?: Record<string, string> }
  ) {
    let envId = String(body.id ?? '').trim()

    if (!envId && body.name) {
      const items = await this.environmentsService.listForUser(user)
      const found = items.find(i => i.name === body.name)
      if (found) envId = String(found.id)
    }

    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 或 name 必填' })
    }

    await this.environmentsService.assertCanAccess(user, envId)
    await this.nativeSyncService.syncEnv(user, envId)

    const options: { tempLaunchArgs?: string[] } = {}
    if (body.tempLaunchArgs) {
      if (Array.isArray(body.tempLaunchArgs)) {
        options.tempLaunchArgs = body.tempLaunchArgs.map(String)
      } else if (typeof body.tempLaunchArgs === 'string') {
        options.tempLaunchArgs = body.tempLaunchArgs.split(/\s+/).filter(Boolean)
      }
    }
    options.tempLaunchArgs = [...(options.tempLaunchArgs || [])]

    const result = await nativeRuntimeBridge.launchBrowser(envId, req, options)
    const chromePort = result.debuggingPort
    const publicPort = nativeRuntimeBridge.allocateDebugPort()
    await this.waitForCdpReady(chromePort)
    await this.cdpProxyService.ensureIpv6Proxy(publicPort, chromePort)
    this.envProxyPorts.set(envId, publicPort)
    return {
      success: true,
      data: { debuggingPort: publicPort }
    }
  }

  async stopBrowser(user: UserRecord, body: Record<string, unknown>) {
    let envId = String(body.id ?? '').trim()

    if (!envId && body.name) {
      const items = await this.environmentsService.listForUser(user)
      const found = items.find(i => i.name === body.name)
      if (found) envId = String(found.id)
    }

    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }

    await this.environmentsService.assertCanAccess(user, envId)
    const publicPort = this.envProxyPorts.get(envId)
    if (publicPort != null) {
      this.cdpProxyService.release(publicPort)
      nativeRuntimeBridge.releaseDebugPort(publicPort)
      this.envProxyPorts.delete(envId)
    }
    await nativeRuntimeBridge.stopBrowser(envId)
    return { success: true }
  }

  async getBrowserRunningList(user: UserRecord) {
    const items = await this.environmentsService.listForUser(user)
    const allowedIds = new Set(items.map(i => String(i.id)))
    const runningIds = nativeRuntimeBridge.getRunningIds().filter(id => allowedIds.has(id))

    const data = runningIds.map(id => {
      const item = items.find(i => String(i.id) === id)
      return {
        id: Number(id),
        name: item?.name || id,
        debuggingPort: null as number | null,
        webdriverPath: null
      }
    })

    return { success: true, data }
  }

  async getCrxList() {
    const result = (await nativeRuntimeBridge.handleNativeCall('getCrxList')) as {
      list?: unknown[]
      data?: { list?: unknown[] }
    }
    const list = result?.list ?? result?.data?.list ?? []
    return { success: true, data: { list } }
  }

  async getBrowserFullParameters(user: UserRecord) {
    const items = await this.environmentsService.listForUser(user)
    const running = new Set(nativeRuntimeBridge.getRunningIds())
    const data = items.map(item => {
      const { ownerId: _o, tenantId: _t, ...rest } = item
      return {
        ...rest,
        id: Number(item.id),
        name: item.name,
        group: item.group || '',
        isRunning: running.has(String(item.id))
      }
    })
    return { success: true, data }
  }

  async isBrowserRunning(user: UserRecord, id: string): Promise<boolean> {
    const envId = String(id ?? '').trim()
    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    await this.environmentsService.assertCanAccess(user, envId)
    return nativeRuntimeBridge.getRunningIds().includes(envId)
  }

  async deleteBrowserData(user: UserRecord, body: Record<string, unknown>) {
    const envId = String(body.id ?? '').trim()
    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    await this.environmentsService.assertCanAccess(user, envId)
    if (nativeRuntimeBridge.getRunningIds().includes(envId)) {
      await nativeRuntimeBridge.stopBrowser(envId)
    }
    deleteBrowserDataDir(envId)
    await this.nativeSyncService.syncEnv(user, envId)
    return { success: true }
  }

  async clearCache(user: UserRecord, body: Record<string, unknown>) {
    const envId = String(body.id ?? '').trim()
    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    await this.environmentsService.assertCanAccess(user, envId)
    if (nativeRuntimeBridge.getRunningIds().includes(envId)) {
      throw new BadRequestException({
        success: false,
        message: '环境运行中，请先 stopBrowser'
      })
    }
    clearBrowserCacheDirs(envId)
    return { success: true }
  }

  async getGroupList(user: UserRecord) {
    const groups = listGroups()
    const items = await this.environmentsService.listForUser(user)
    const counts = new Map<string, number>()
    for (const item of items) {
      const g = String(item.group || '')
      counts.set(g, (counts.get(g) || 0) + 1)
    }
    const data = groups.map(g => ({
      ...g,
      count: counts.get(g.name) || 0
    }))
    return { success: true, data }
  }

  async addGroup(body: Record<string, unknown>) {
    const name = String(body.name || '').trim()
    if (!name) {
      throw new BadRequestException({ success: false, message: 'name 必填' })
    }
    const item = addGroup(name)
    return { success: true, data: item }
  }

  async updateGroup(body: Record<string, unknown>) {
    const id = Number(body.id)
    const name = String(body.name || '').trim()
    if (!Number.isFinite(id)) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    if (!name) {
      throw new BadRequestException({ success: false, message: 'name 必填' })
    }
    try {
      const item = updateGroup(id, name)
      return { success: true, data: item }
    } catch (err) {
      throw new NotFoundException({
        success: false,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async deleteGroup(body: Record<string, unknown>) {
    const id = Number(body.id)
    if (!Number.isFinite(id)) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    try {
      deleteGroup(id)
      return { success: true }
    } catch (err) {
      throw new NotFoundException({
        success: false,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async deleteCrx(body: Record<string, unknown>) {
    const id = body.id
    if (id == null || String(id).trim() === '') {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    try {
      await nativeRuntimeBridge.handleNativeCall('deleteLocalCrx', [id])
      return { success: true }
    } catch (err) {
      throw new NotFoundException({
        success: false,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  async randomizeFingerprint(user: UserRecord, body: Record<string, unknown>) {
    const envId = String(body.id ?? '').trim()
    if (!envId) {
      throw new BadRequestException({ success: false, message: 'id 必填' })
    }
    const current = await this.environmentsService.assertCanAccess(user, envId)
    const currentItem = {
      id: current.envId,
      name: current.name,
      group: current.group,
      ...current.payload
    } as BrowserEnvironmentItem

    const randomized = randomizeFingerprintFields(
      currentItem as unknown as Record<string, unknown>
    ) as BrowserEnvironmentItem
    randomized.id = currentItem.id
    randomized.name = currentItem.name
    randomized.group = currentItem.group

    await this.environmentsService.update(user, envId, randomized)
    await this.nativeSyncService.syncEnv(user, envId)
    return {
      success: true,
      data: {
        id: Number(envId),
        message: 'Fingerprint randomized successfully'
      }
    }
  }

  async addCrx(body: Record<string, unknown>) {
    const storeUrl = body.storeUrl || body.url
    const hasFile =
      body.base64 != null ||
      body.path != null ||
      body.filePath != null ||
      (typeof body === 'string' && body)

    if (storeUrl && !body.base64 && !body.path && !body.filePath) {
      throw new BadRequestException({
        success: false,
        message: '仅 storeUrl 无法从 Chrome 商店下载（BLOCK-01）；请传 base64 或本地 path'
      })
    }
    if (!hasFile && !storeUrl) {
      throw new BadRequestException({
        success: false,
        message: '需要 { name, base64 } 或 { path }'
      })
    }

    const payload =
      typeof body.path === 'string' && !body.base64
        ? { path: String(body.path), name: body.name }
        : body

    try {
      const result = (await nativeRuntimeBridge.handleNativeCall('addLocalCrx', [
        payload
      ])) as { ok?: boolean; item?: unknown; message?: string }
      return { success: true, data: result?.item ?? result }
    } catch (err) {
      throw new BadRequestException({
        success: false,
        message: err instanceof Error ? err.message : String(err)
      })
    }
  }

  private extractPayload(body: Record<string, unknown>): Record<string, unknown> {
    const {
      id: _id,
      name: _name,
      group: _group,
      ownerId: _o,
      tenantId: _t,
      ...rest
    } = body
    return rest
  }

  private async waitForCdpReady(port: number, timeoutMs = 15000): Promise<void> {
    const http = await import('http')
    const started = Date.now()
    while (Date.now() - started < timeoutMs) {
      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${port}/json/version`, res => {
            res.resume()
            resolve()
          })
          req.on('error', reject)
          req.setTimeout(2000, () => {
            req.destroy()
            reject(new Error('timeout'))
          })
        })
        return
      } catch {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    throw new BadRequestException({
      success: false,
      message: `CDP 端口 ${port} 未就绪`
    })
  }
}
