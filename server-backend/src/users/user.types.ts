export interface UserRecord {
  id: string
  username: string
  passwordHash: string
  name: string
  roles: string[]
  tenantId: string
  disabled: boolean
  createdAt?: string
}

export interface PublicUser {
  id: string
  username: string
  name: string
  roles: string[]
  tenantId: string
}

export interface AdminUserView extends PublicUser {
  disabled: boolean
  createdAt?: string
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roles: user.roles,
    tenantId: user.tenantId
  }
}

export function toAdminUserView(user: UserRecord): AdminUserView {
  return {
    ...toPublicUser(user),
    disabled: user.disabled,
    createdAt: user.createdAt
  }
}

export const ALLOWED_ROLES = ['admin', 'operator', 'viewer'] as const
