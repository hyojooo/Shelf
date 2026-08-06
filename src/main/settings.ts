import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

// 设置持久化（功能 6）：存于 userData/settings.json
const file = () => path.join(app.getPath('userData'), 'settings.json')
let settings: Settings = { ...DEFAULT_SETTINGS }

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(file(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    settings = { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    settings = { ...DEFAULT_SETTINGS }
  }
  return settings
}

export function getSettings(): Settings {
  return settings
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  settings = { ...settings, ...partial }
  await fs.writeFile(file(), JSON.stringify(settings, null, 2), 'utf8')
  return settings
}
