import { EnvironmentRecord } from '../../environments/environment.types'

export interface EnvironmentRepository {
  findByTenant(tenantId: string): Promise<EnvironmentRecord[]>
  findByOwner(ownerId: string): Promise<EnvironmentRecord[]>
  findByEnvId(envId: string): Promise<EnvironmentRecord | null>
  findByEnvIdAndTenant(envId: string, tenantId: string): Promise<EnvironmentRecord | null>
  create(record: EnvironmentRecord): Promise<EnvironmentRecord>
  update(envId: string, record: Partial<EnvironmentRecord>): Promise<EnvironmentRecord | null>
  delete(envId: string): Promise<boolean>
}
