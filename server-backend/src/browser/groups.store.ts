import * as fs from 'fs'
import * as path from 'path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getGlobalDatFile } = require('../../../config/vb-paths')

const userDataFile = getGlobalDatFile() as string

export interface GroupItem {
  id: number
  name: string
  timestamp?: number
  count?: number
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function readGlobal(): Record<string, unknown> {
  try {
    if (!fs.existsSync(userDataFile)) return {}
    const raw = fs.readFileSync(userDataFile, 'utf8')
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeGlobal(data: Record<string, unknown>) {
  ensureDir(path.dirname(userDataFile))
  fs.writeFileSync(userDataFile, JSON.stringify(data), 'utf8')
}

export function listGroups(): GroupItem[] {
  const global = readGlobal()
  const list = global.group
  if (!Array.isArray(list)) return []
  return list
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const g = item as Record<string, unknown>
      return {
        id: Number(g.id),
        name: String(g.name || ''),
        timestamp: g.timestamp != null ? Number(g.timestamp) : undefined,
        count: g.count != null ? Number(g.count) : undefined
      }
    })
    .filter(g => Number.isFinite(g.id))
}

export function saveGroups(list: GroupItem[]): void {
  const global = readGlobal()
  global.group = list
  writeGlobal(global)
}

export function addGroup(name: string): GroupItem {
  const list = listGroups()
  const maxId = Math.max(0, ...list.map(g => g.id))
  const item: GroupItem = {
    id: maxId + 1,
    name: name || `分组 ${maxId + 1}`,
    timestamp: Date.now()
  }
  list.push(item)
  saveGroups(list)
  return item
}

export function updateGroup(id: number, name: string): GroupItem {
  const list = listGroups()
  const idx = list.findIndex(g => g.id === id)
  if (idx < 0) {
    throw new Error(`分组不存在: ${id}`)
  }
  list[idx] = {
    ...list[idx],
    name,
    timestamp: Date.now()
  }
  saveGroups(list)
  return list[idx]
}

export function deleteGroup(id: number): void {
  const list = listGroups()
  const idx = list.findIndex(g => g.id === id)
  if (idx < 0) {
    throw new Error(`分组不存在: ${id}`)
  }
  list.splice(idx, 1)
  saveGroups(list)
}
