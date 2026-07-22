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

export function batchCreateEnvironments(items) {
  return request({
    url: '/api/environments/batch',
    method: 'post',
    data: { items },
    timeout: 120000
  })
}

export function batchDeleteEnvironments(ids) {
  return request({
    url: '/api/environments/batch',
    method: 'delete',
    data: { ids },
    timeout: 120000
  })
}

export function batchUpdateEnvironmentGroup(ids, group) {
  return request({
    url: '/api/environments/batch-group',
    method: 'post',
    data: { ids, group },
    timeout: 120000
  })
}
