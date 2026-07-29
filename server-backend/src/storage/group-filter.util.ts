/** Canonical name for the default browser group in UI / catalog. */
export const DEFAULT_GROUP_NAME = '默认分组'

/** Whether the list filter refers to the default group (also matches empty group). */
export function isDefaultGroupFilter(group?: string): boolean {
  return String(group || '').trim() === DEFAULT_GROUP_NAME
}

/** Match row.group against filter.group;「默认分组」also matches '' / unset. */
export function matchesGroupFilter(
  rowGroup: string | undefined | null,
  filterGroup: string
): boolean {
  if (!filterGroup) return true
  if (isDefaultGroupFilter(filterGroup)) {
    const g = String(rowGroup || '').trim()
    return g === '' || g === DEFAULT_GROUP_NAME
  }
  return String(rowGroup || '') === filterGroup
}

/** Read jddj shopId from environment payload (if present). */
export function extractJddjShopId(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== 'object') return ''
  const snap = payload.siteSnapshot
  if (!snap || typeof snap !== 'object') return ''
  const jddj = (snap as Record<string, unknown>).jddj
  if (!jddj || typeof jddj !== 'object') return ''
  const id = (jddj as Record<string, unknown>).shopId
  return id != null ? String(id).trim() : ''
}
