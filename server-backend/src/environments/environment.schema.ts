import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type EnvironmentDocument = Environment & Document

@Schema({ timestamps: true })
export class Environment {
  @Prop({ required: true, index: true })
  envId: string

  @Prop({ required: true, index: true })
  ownerId: string

  @Prop({ required: true, index: true, default: '1' })
  tenantId: string

  @Prop({ required: true })
  name: string

  @Prop({ default: '' })
  group: string

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>
}

export const EnvironmentSchema = SchemaFactory.createForClass(Environment)
EnvironmentSchema.index({ tenantId: 1, envId: 1 }, { unique: true })
