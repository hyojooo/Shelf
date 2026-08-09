import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/types'
import { logError, logInfo } from './logger'

// 应用内更新检查（功能 10）：基于 electron-updater，更新源可在 electron-builder.yml 配置
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

// 收集所有需要接收更新状态的渲染窗口（面板 + 偏好设置）
const updateWindows: Array<() => BrowserWindow | null> = []

export function setupUpdater(getWindow: () => BrowserWindow | null): void {
  updateWindows.push(getWindow)

  // 向所有已注册窗口广播更新状态
  const broadcast = (payload: Record<string, unknown>) => {
    for (const getW of updateWindows) {
      const w = getW()
      if (w && !w.isDestroyed()) w.webContents.send(IPC.UPDATE_STATE, payload)
    }
  }

  autoUpdater.on('update-available', (info) => {
    logInfo(`update available: ${info.version}`)
    broadcast({
      status: 'available',
      version: info.version,
      notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
    })
  })
  autoUpdater.on('update-not-available', () => {
    broadcast({ status: 'not-available' })
  })
  autoUpdater.on('download-progress', (p) => {
    broadcast({ status: 'progress', percent: p.percent })
  })
  autoUpdater.on('update-downloaded', () => {
    broadcast({ status: 'downloaded' })
  })
  autoUpdater.on('error', (e) => {
    logError(e, 'updater')
    broadcast({ status: 'error', message: String(e) })
  })
}

/** 注册额外窗口（如偏好设置）以接收更新状态广播 */
export function registerUpdateWindow(getWindow: () => BrowserWindow | null): void {
  updateWindows.push(getWindow)
}

export async function checkForUpdates(getWindow?: () => BrowserWindow | null): Promise<unknown> {
  try {
    return await autoUpdater.checkForUpdates()
  } catch (e) {
    logError(e, 'updater')
    // 通知渲染进程检查失败（不再静默吞掉）
    getWindow?.()?.webContents.send(IPC.UPDATE_STATE, {
      status: 'error',
      message: String(e instanceof Error ? e.message : e)
    })
    return null
  }
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
