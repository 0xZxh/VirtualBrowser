import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Session, SessionDocument } from '../../../auth/session.schema'
import { SessionRecord, SessionRepository } from '../../interfaces/session.repository'

@Injectable()
export class MongoSessionRepository implements SessionRepository {
  constructor(@InjectModel(Session.name) private sessionModel: Model<SessionDocument>) {}

  async create(token: string, userId: string, expiresAt: Date): Promise<void> {
    await this.sessionModel.create({ token, userId, expiresAt })
  }

  async deleteByToken(token: string): Promise<void> {
    await this.sessionModel.deleteOne({ token })
  }

  async findByToken(token: string): Promise<SessionRecord | null> {
    const doc = await this.sessionModel.findOne({ token })
    if (!doc) return null
    return {
      token: doc.token,
      userId: String(doc.userId),
      expiresAt: doc.expiresAt
    }
  }
}
