export interface EnvironmentRecord {
  envId: string
  ownerId: string
  tenantId: string
  name: string
  group: string
  payload: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface BrowserEnvironmentItem {
  id: number | string
  name: string
  group?: string
  ownerId?: string
  tenantId?: string
  [key: string]: unknown
}

export function toBrowserItem(record: EnvironmentRecord): BrowserEnvironmentItem {
  const numericId = Number(record.envId)
  return {
    ...record.payload,
    id: Number.isFinite(numericId) ? numericId : record.envId,
    name: record.name,
    group: record.group,
    ownerId: record.ownerId,
    tenantId: record.tenantId
  }
}

export function fromBrowserItem(
  item: BrowserEnvironmentItem,
  ownerId: string,
  tenantId: string,
  envId?: string
): EnvironmentRecord {
  const now = new Date().toISOString()
  const id = envId ?? String(item.id ?? '')
  const { id: _id, name, group, ownerId: _o, tenantId: _t, ...payload } = item

  return {
    envId: id,
    ownerId,
    tenantId,
    name: String(name || id),
    group: String(group || ''),
    payload,
    createdAt: now,
    updatedAt: now
  }
}
