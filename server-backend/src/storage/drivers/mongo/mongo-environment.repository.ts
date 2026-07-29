import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model } from 'mongoose'
import { Environment, EnvironmentDocument } from '../../../environments/environment.schema'
import { EnvironmentRecord } from '../../../environments/environment.types'
import {
  EnvironmentListFilter,
  EnvironmentPageOptions,
  EnvironmentRepository
} from '../../interfaces/environment.repository'
import { DEFAULT_GROUP_NAME, isDefaultGroupFilter } from '../../group-filter.util'

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

  async findPage(
    filter: EnvironmentListFilter,
    options: EnvironmentPageOptions
  ): Promise<EnvironmentRecord[]> {
    const skip = Math.max(0, options.skip || 0)
    const limit = Math.max(1, options.limit || 20)
    const desc = options.sortOrder === 'desc' ? -1 : 1
    const sortBy = options.sortBy === 'createdAt' ? 'createdAt' : 'id'

    if (sortBy === 'createdAt') {
      const docs = await this.envModel
        .find(this.buildQuery(filter))
        .sort({ createdAt: desc, envId: desc })
        .skip(skip)
        .limit(limit)
      return docs.map(doc => this.mapDoc(doc))
    }

    // Numeric envId sort (string envId alone sorts "10" before "2")
    const match = this.buildQuery(filter)
    const rows = await this.envModel.aggregate([
      { $match: match },
      {
        $addFields: {
          _envIdNum: {
            $convert: { input: '$envId', to: 'int', onError: 0, onNull: 0 }
          }
        }
      },
      { $sort: { _envIdNum: desc, envId: desc } },
      { $skip: skip },
      { $limit: limit }
    ])
    return rows.map(doc => this.mapDoc(doc as EnvironmentDocument))
  }

  async count(filter: EnvironmentListFilter): Promise<number> {
    return this.envModel.countDocuments(this.buildQuery(filter))
  }

  async getMaxEnvId(tenantId: string): Promise<number> {
    const result = await this.envModel.aggregate<{ max: number }>([
      { $match: { tenantId } },
      {
        $project: {
          n: {
            $convert: { input: '$envId', to: 'int', onError: 0, onNull: 0 }
          }
        }
      },
      { $group: { _id: null, max: { $max: '$n' } } }
    ])
    const max = result[0]?.max
    return Number.isFinite(max) ? max : 0
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

  private buildQuery(filter: EnvironmentListFilter): FilterQuery<EnvironmentDocument> {
    const query: FilterQuery<EnvironmentDocument> = {}
    if (filter.tenantId) query.tenantId = filter.tenantId
    if (filter.ownerId) query.ownerId = filter.ownerId
    const and: FilterQuery<EnvironmentDocument>[] = []
    if (filter.group) {
      if (isDefaultGroupFilter(filter.group)) {
        and.push({
          $or: [
            { group: '' },
            { group: DEFAULT_GROUP_NAME },
            { group: { $exists: false } },
            { group: null as unknown as string }
          ]
        })
      } else {
        query.group = filter.group
      }
    }
    const shopIdFilter = filter.shopId != null ? String(filter.shopId).trim() : ''
    if (shopIdFilter) {
      query['payload.siteSnapshot.jddj.shopId'] = shopIdFilter
    }
    const q = filter.q != null ? String(filter.q).trim() : ''
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      and.push({
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { envId: { $regex: escaped, $options: 'i' } },
          { 'payload.siteSnapshot.jddj.shopId': { $regex: escaped, $options: 'i' } }
        ]
      })
    }
    if (and.length === 1) {
      Object.assign(query, and[0])
    } else if (and.length > 1) {
      query.$and = and
    }
    return query
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
