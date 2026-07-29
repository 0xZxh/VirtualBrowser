import { EnvironmentRecord } from '../../environments/environment.types'

export type EnvironmentListFilter = {
  tenantId?: string
  ownerId?: string
  /** Exact group name; empty/undefined = all.「默认分组」also matches empty group. */
  group?: string
  /** Match name, envId, or jddj shopId (substring) */
  q?: string
  /** Exact match on payload.siteSnapshot.jddj.shopId */
  shopId?: string
}

export type EnvironmentPageOptions = {
  skip: number
  limit: number
  /** Default: id */
  sortBy?: 'id' | 'createdAt'
  /** Default: asc */
  sortOrder?: 'asc' | 'desc'
}

export interface EnvironmentRepository {
  findByTenant(tenantId: string): Promise<EnvironmentRecord[]>
  findByOwner(ownerId: string): Promise<EnvironmentRecord[]>
  findByEnvId(envId: string): Promise<EnvironmentRecord | null>
  findByEnvIdAndTenant(envId: string, tenantId: string): Promise<EnvironmentRecord | null>
  findPage(
    filter: EnvironmentListFilter,
    options: EnvironmentPageOptions
  ): Promise<EnvironmentRecord[]>
  count(filter: EnvironmentListFilter): Promise<number>
  /** Max numeric envId for tenant; 0 if none */
  getMaxEnvId(tenantId: string): Promise<number>
  create(record: EnvironmentRecord): Promise<EnvironmentRecord>
  update(envId: string, record: Partial<EnvironmentRecord>): Promise<EnvironmentRecord | null>
  delete(envId: string): Promise<boolean>
}
