import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type SessionDocument = Session & Document

@Schema({ timestamps: true })
export class Session {
  @Prop({ required: true, unique: true, index: true })
  token: string

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId

  @Prop({ required: true })
  expiresAt: Date
}

export const SessionSchema = SchemaFactory.createForClass(Session)

SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
