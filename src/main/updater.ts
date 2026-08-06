import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/types'
import { logError, logInfo } from './logger'

// 应用内更新检查（功能 10）：基于 electron-updater，更新源可在 electron-builder.yml 配置
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

export function setupUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.on('update-available', (info) => {
    logInfo(`update available: ${info.version}`)
    getWindow()?.webContents.send(IPC.UPDATE_STATE, {
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
    })
  })
  autoUpdater.on('update-not-available', () => {
    getWindow()?.webContents.send(IPC.UPDATE_STATE, { status: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    getWindow()?.webContents.send(IPC.UPDATE_STATE, { status: 'progress', percent: p.percent })
  })
  autoUpdater.on('update-downloaded', () => {
    getWindow()?.webContents.send(IPC.UPDATE_STATE, { status: 'downloaded' })
  })
  autoUpdater.on('error', (e) => {
    logError(e, 'updater')
    getWindow()?.webContents.send(IPC.UPDATE_STATE, { status: 'error', message: String(e) })
  })
}

export async function checkForUpdates(): Promise<unknown> {
  try {
    return await autoUpdater.checkForUpdates()
  } catch (e) {
    logError(e, 'updater')
    return null
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
