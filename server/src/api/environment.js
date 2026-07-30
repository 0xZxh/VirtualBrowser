import request from '@/utils/request'

export function fetchEnvironments(params = {}) {
  return request({
    url: '/api/environments',
    method: 'get',
    params
  })
}

/** 分配浏览器弹窗：轻量分页，仅 id/name/group/ownerId/createdAt */
export function fetchAssignOptions(params = {}) {
  return request({
    url: '/api/environments/assign-options',
    method: 'get',
    params,
    timeout: 60000
  })
}

export function fetchEnvironment(envId) {
  return request({
    url: `/api/environments/${envId}`,
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
    data,
    // 整行或含 cookie 的更新可能超过默认 10s
    timeout: 30000
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

/** 读取环境 siteSnapshot（含 jddj） */
export function fetchEnvironmentSiteSnapshot(envId) {
  return request({
    url: `/api/environments/${envId}/site-snapshot`,
    method: 'get'
  })
}

/**
 * 合并写入 payload.siteSnapshot.jddj
 * @param {string|number} envId
 * @param {{ jddj?: object, siteSnapshot?: object }} data
 */
export function updateEnvironmentSiteSnapshot(envId, data) {
  return request({
    url: `/api/environments/${envId}/site-snapshot`,
    method: 'put',
    data: data || {}
  })
}
