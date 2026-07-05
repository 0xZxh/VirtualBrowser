import request from '@/utils/request'

export function fetchEnvironments() {
  return request({
    url: '/api/environments',
    method: 'get'
  })
}

export function createEnvironment(data) {
  return request({
    url: '/api/environments',
    method: 'post',
    data
  })
}

export function updateEnvironment(envId, data) {
  return request({
    url: `/api/environments/${envId}`,
    method: 'put',
    data
  })
}

export function deleteEnvironment(envId) {
  return request({
    url: `/api/environments/${envId}`,
    method: 'delete'
  })
}

export function importEnvironments(items) {
  return request({
    url: '/api/environments/import',
    method: 'post',
    data: { items }
  })
}
