import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Environment, EnvironmentDocument } from '../../../environments/environment.schema'
import { EnvironmentRecord } from '../../../environments/environment.types'
import { EnvironmentRepository } from '../../interfaces/environment.repository'

@Injectable()
export class MongoEnvironmentRepository implements EnvironmentRepository {
  constructor(@InjectModel(Environment.name) private envModel: Model<EnvironmentDocument>) {}

  async findByTenant(tenantId: string): Promise<EnvironmentRecord[]> {
    const docs = await this.envModel.find({ tenantId }).sort({ envId: 1 })
    return docs.map(doc => this.mapDoc(doc))
  }

  async findByOwner(ownerId: string): Promise<EnvironmentRecord[]> {
    const docs = await this.envModel.find({ ownerId }).sort({ envId: 1 })
    return docs.map(doc => this.mapDoc(doc))
  }

  async findByEnvId(envId: string): Promise<EnvironmentRecord | null> {
    const doc = await this.envModel.findOne({ envId })
    return doc ? this.mapDoc(doc) : null
  }

  async findByEnvIdAndTenant(envId: string, tenantId: string): Promise<EnvironmentRecord | null> {
    const doc = await this.envModel.findOne({ envId, tenantId })
    return doc ? this.mapDoc(doc) : null
  }

  async create(record: EnvironmentRecord): Promise<EnvironmentRecord> {
    const doc = await this.envModel.create({
      envId: record.envId,
      ownerId: record.ownerId,
      tenantId: record.tenantId,
      name: record.name,
      group: record.group,
      payload: record.payload
    })
    return this.mapDoc(doc)
  }

  async update(envId: string, patch: Partial<EnvironmentRecord>): Promise<EnvironmentRecord | null> {
    const current = await this.findByEnvId(envId)
    if (!current) return null

    const doc = await this.envModel.findOneAndUpdate(
      { envId, tenantId: patch.tenantId ?? current.tenantId },
      {
        ...(patch.ownerId !== undefined ? { ownerId: patch.ownerId } : {}),
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.group !== undefined ? { group: patch.group } : {}),
        ...(patch.payload !== undefined ? { payload: patch.payload } : {})
      },
      { new: true }
    )
    return doc ? this.mapDoc(doc) : null
  }

  async delete(envId: string): Promise<boolean> {
    const result = await this.envModel.deleteOne({ envId })
    return result.deletedCount > 0
  }

  private mapDoc(doc: EnvironmentDocument): EnvironmentRecord {
    const createdAt = (doc as EnvironmentDocument & { createdAt?: Date }).createdAt
    const updatedAt = (doc as EnvironmentDocument & { updatedAt?: Date }).updatedAt
    return {
      envId: doc.envId,
      ownerId: doc.ownerId,
      tenantId: doc.tenantId,
      name: doc.name,
      group: doc.group,
      payload: doc.payload || {},
      createdAt: createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: updatedAt?.toISOString() || new Date().toISOString()
    }
  }
}
