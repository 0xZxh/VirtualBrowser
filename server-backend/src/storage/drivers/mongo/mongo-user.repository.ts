import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { User, UserDocument } from '../../../users/user.schema'
import { UserRecord } from '../../../users/user.types'
import {
  CreateUserInput,
  UpdateUserInput,
  UserRepository
} from '../../interfaces/user.repository'

@Injectable()
export class MongoUserRepository implements UserRepository {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  async count(): Promise<number> {
    return this.userModel.countDocuments()
  }

  async findAll(): Promise<UserRecord[]> {
    const docs = await this.userModel.find().sort({ createdAt: 1 })
    return docs.map(doc => this.mapDoc(doc))
  }

  async create(input: CreateUserInput): Promise<UserRecord> {
    const doc = await this.userModel.create({
      username: input.username,
      passwordHash: input.passwordHash,
      name: input.name,
      roles: input.roles,
      tenantId: input.tenantId
    })
    return this.mapDoc(doc)
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const doc = await this.userModel.findOne({ username })
    return doc ? this.mapDoc(doc) : null
  }

  async findById(id: string): Promise<UserRecord | null> {
    const doc = await this.userModel.findById(id)
    return doc ? this.mapDoc(doc) : null
  }

  async update(id: string, input: UpdateUserInput): Promise<UserRecord | null> {
    const doc = await this.userModel.findByIdAndUpdate(
      id,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.roles !== undefined ? { roles: input.roles } : {}),
        ...(input.tenantId !== undefined ? { tenantId: input.tenantId } : {}),
        ...(input.disabled !== undefined ? { disabled: input.disabled } : {})
      },
      { new: true }
    )
    return doc ? this.mapDoc(doc) : null
  }

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = await this.userModel.updateOne({ _id: id }, { passwordHash })
    return result.modifiedCount > 0 || result.matchedCount > 0
  }

  private mapDoc(doc: UserDocument): UserRecord {
    return {
      id: String(doc._id),
      username: doc.username,
      passwordHash: doc.passwordHash,
      name: doc.name,
      roles: doc.roles,
      tenantId: doc.tenantId,
      disabled: doc.disabled,
      createdAt: (doc as UserDocument & { createdAt?: Date }).createdAt?.toISOString()
    }
  }
}
