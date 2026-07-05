import { UserRecord } from '../../users/user.types'

export interface CreateUserInput {
  username: string
  passwordHash: string
  name: string
  roles: string[]
  tenantId: string
}

export interface UpdateUserInput {
  name?: string
  roles?: string[]
  tenantId?: string
  disabled?: boolean
}

export interface UserRepository {
  count(): Promise<number>
  findAll(): Promise<UserRecord[]>
  create(input: CreateUserInput): Promise<UserRecord>
  findByUsername(username: string): Promise<UserRecord | null>
  findById(id: string): Promise<UserRecord | null>
  update(id: string, input: UpdateUserInput): Promise<UserRecord | null>
  updatePassword(id: string, passwordHash: string): Promise<boolean>
}
