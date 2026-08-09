import { app, ipcMain, clipboard, nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { IPC, type Clip, type Settings } from '../shared/types'
import { installCrashHandlers, logError } from './logger'
import { loadSettings, getSettings, saveSettings } from './settings'
import { ClipStore } from './store'
import { startClipboardMonitor, suppressNextCapture } from './clipboard'
import { createPanelWindow, toggle, hide, getWindow, isVisible, getSourceApp, showPanel } from './window'
import { createTray } from './tray'
import { openPreferencesWindow, getPreferencesWindow } from './preferences'
import { registerShortcut, unregister, unregisterAll } from './shortcut'
import { setupUpdater, checkForUpdates, quitAndInstall, registerUpdateWindow } from './updater'

installCrashHandlers()

let store: ClipStore
let currentAccelerator = ''

function applyShortcut(accel: string): boolean {
  if (currentAccelerator) unregister(currentAccelerator)
  const ok = registerShortcut(accel, () => toggle(getSettings().panelPosition))
  if (ok) {
    currentAccelerator = accel
  } else if (currentAccelerator) {
    // 新快捷键注册失败，回退到旧快捷键
    registerShortcut(currentAccelerator, () => toggle(getSettings().panelPosition))
  }
  return ok
}

/** 将一条记录写入系统剪切板，并抑制下一次自动捕获（避免回环） */
function setClipboard(clip: Clip): void {
  if (clip.type === 'text') {
    clipboard.writeText(clip.text)
  } else {
    const p = store.getImagePath(clip.id)
    if (p) clipboard.writeImage(nativeImage.createFromPath(p))
  }
  suppressNextCapture()
}

/**
 * 向「当前前台应用」模拟粘贴（Cmd/Ctrl + V）。
 *
 * 前提：调用方必须先 hide() 隐藏面板，让 macOS 把焦点自动归还给
 * 打开面板前正在使用的源应用——落点完全由「此时谁在前台」决定。
 * 若已知源应用名则先显式 activate 兜底（个别情况下焦点未自动归还时）。
 * 注意：必须在 hide() 之后、且等焦点切换完成（见 PASTE handler 的延时）再调用。
 */
function sendPasteKeystroke(targetApp: string): void {
  if (process.platform === 'darwin') {
    const activate = targetApp ? `tell application "${targetApp}" to activate\n` : ''
    const script = `${activate}delay 0.06\ntell application "System Events" to keystroke "v" using command down`
    execFile('osascript', ['-e', script])
  } else if (process.platform === 'win32') {
    execFile('powershell', [
      '-NoProfile',
      '-Command',
      'Start-Sleep -Milliseconds 60; (New-Object -ComObject WScript.Shell).SendKeys("^v")'
    ])
  }
}

function openSettings(): void {
  // 菜单栏「偏好设置」打开独立窗口（与面板内设置页共用 SettingsForm）
  openPreferencesWindow()
}

async function bootstrap(): Promise<void> {
  const settings = await loadSettings()
  store = new ClipStore(app.getPath('userData'), settings.maxItems, settings.cleanupBatch)
  await store.init()

  if (process.platform === 'darwin') app.dock?.hide()

  createPanelWindow()
  setupUpdater(getWindow)
  // 偏好设置窗口也接收更新状态广播（点"检查"时弹窗才能显示）
  registerUpdateWindow(getPreferencesWindow)
  createTray({ show: () => showPanel(getSettings().panelPosition), openPreferences: openSettings, quit: () => app.quit() })

  applyShortcut(settings.globalShortcut)
  app.setLoginItemSettings({ openAtLogin: settings.launchAtLogin, args: ['--hidden'] })

  startClipboardMonitor(store)
  store.subscribe((clips) => {
    getWindow()?.webContents.send(IPC.UPDATED, clips)
  })

  // —— IPC 处理 ——
  ipcMain.handle(IPC.GET_ALL, () => store.getClips())

  ipcMain.handle(IPC.FAVORITE, async (_e, payload: { id: string; favorite: boolean }) => {
    await store.setFavorite(payload.id, payload.favorite)
    return true
  })
  ipcMain.handle(IPC.DELETE, async (_e, payload: { id: string }) => {
    await store.deleteClip(payload.id)
    return true
  })
  ipcMain.handle(IPC.CLEAR, async () => {
    await store.clearAll()
    return true
  })
  ipcMain.handle(IPC.COPY, (_e, payload: { id: string }) => {
    const clip = store.getClips().find((c) => c.id === payload.id)
    if (!clip) return false
    setClipboard(clip)
    return true
  })
  ipcMain.handle(IPC.PASTE, (_e, payload: { id: string }) => {
    const clip = store.getClips().find((c) => c.id === payload.id)
    if (!clip) return false
    // 1) 同步隐藏面板：macOS 随之把焦点归还给打开面板前的前台（源）应用
    hide()
    const targetApp = getSourceApp()
    // 2) 等焦点切换完成后再写剪贴板 + 模拟 Cmd+V（关键：隐藏必须先于按键）
    setTimeout(() => {
      setClipboard(clip)
      sendPasteKeystroke(targetApp)
    }, 60)
    return true
  })

  ipcMain.handle(IPC.GET_SETTINGS, () => getSettings())
  ipcMain.handle(IPC.UPDATE_SETTINGS, async (_e, partial: Partial<Settings>) => {
    const next = await saveSettings(partial)
    if (typeof partial.globalShortcut === 'string') {
      const ok = applyShortcut(partial.globalShortcut)
      if (!ok) getWindow()?.webContents.send(IPC.SHORTCUT_ERROR, partial.globalShortcut)
    }
    if (typeof partial.launchAtLogin === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: partial.launchAtLogin, args: ['--hidden'] })
    }
    if (typeof partial.maxItems === 'number' || typeof partial.cleanupBatch === 'number') {
      store.setLimits(next.maxItems, next.cleanupBatch)
    }
    getWindow()?.webContents.send(IPC.SETTINGS_UPDATED, next)
    return next
  })

  ipcMain.handle(IPC.CHECK_UPDATE, () => checkForUpdates(getWindow))
  ipcMain.handle(IPC.GET_VERSION, () => app.getVersion())
  ipcMain.handle(IPC.QUIT, () => {
    app.quit()
    return true
  })
  ipcMain.on(IPC.INSTALL_UPDATE, () => quitAndInstall())
}

app.whenReady().then(bootstrap).catch((e) => {
  void logError(e, 'bootstrap')
})

app.on('before-quit', async () => {
  if (store) await store.flush()
  unregisterAll()
})

// 保持托盘常驻：关闭最后一个窗口不退出应用（macOS）
app.on('window-all-closed', () => {
  /* noop */
})
