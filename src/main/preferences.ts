import { BrowserWindow, app } from 'electron'
import path from 'node:path'

// 独立偏好设置窗口（功能：菜单栏 → 偏好设置）
// 与面板内弹窗共用 SettingsForm，但作为单独的 frameless 窗口存在，
// 可点击右上角 ✕（内部调用 window.close()）单独关闭，不影响主面板。
const isDev = !!process.env.VITE_DEV_SERVER_URL
let prefWin: BrowserWindow | null = null

function getPreloadPath(): string {
  return path.join(app.getAppPath(), 'out', 'preload', 'index.js')
}

/** 打开（或聚焦）偏好设置窗口 */
export function openPreferencesWindow(): void {
  if (prefWin && !prefWin.isDestroyed()) {
    prefWin.show()
    prefWin.focus()
    return
  }

  prefWin = new BrowserWindow({
    width: 520,
    height: 700,
    minWidth: 480,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    transparent: false,
    hasShadow: true,
    roundedCorners: true,
    title: '偏好设置 · Shelf',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  prefWin.setAlwaysOnTop(true, 'floating', 1)

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    void prefWin.loadURL(`${process.env.VITE_DEV_SERVER_URL}/preferences.html`)
  } else {
    void prefWin.loadFile(path.join(app.getAppPath(), 'out', 'renderer', 'preferences.html'))
  }

  prefWin.once('ready-to-show', () => {
    prefWin?.show()
    prefWin?.focus()
  })

  prefWin.on('closed', () => {
    prefWin = null
  })
}

/** 供托盘 / 升级逻辑查询窗口是否已打开 */
export function isPreferencesOpen(): boolean {
  return !!prefWin && !prefWin.isDestroyed()
}
