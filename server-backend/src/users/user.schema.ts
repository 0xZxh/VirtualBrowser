import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type UserDocument = User & Document

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true })
  username: string

  @Prop({ required: true })
  passwordHash: string

  @Prop({ required: true })
  name: string

  @Prop({ type: [String], default: ['viewer'] })
  roles: string[]

  @Prop({ default: '1' })
  tenantId: string

  @Prop({ default: false })
  disabled: boolean
}

export const UserSchema = SchemaFactory.createForClass(User)

import { UserRecord, PublicUser, toPublicUser } from './user.types'

export type { PublicUser, UserRecord }
export { toPublicUser }
