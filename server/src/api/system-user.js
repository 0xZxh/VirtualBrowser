import request from '@/utils/request'

export function fetchUserList() {
  return request({
    url: '/api/users',
    method: 'get'
  })
}

export function createUser(data) {
  return request({
    url: '/api/users',
    method: 'post',
    data
  })
}

export function updateUser(id, data) {
  return request({
    url: `/api/users/${id}`,
    method: 'put',
    data
  })
}

export function resetUserPassword(id, password) {
  return request({
    url: `/api/users/${id}/password`,
    method: 'put',
    data: { password }
  })
}

export function disableUser(id) {
  return request({
    url: `/api/users/${id}`,
    method: 'delete'
  })
}

export function assignUserEnvironments(userId, envIds) {
  return request({
    url: `/api/users/${userId}/environments`,
    method: 'put',
    data: { envIds }
  })
}
